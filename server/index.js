import { readFileSync } from 'fs'
import os from 'os'
import fs from 'fs/promises'
import express from 'express'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

// Load .env before anything reads process.env
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch { /* no .env file — env vars must be set externally */ }
import { execFile } from 'child_process'
import { promisify } from 'util'
import { scanTarget } from './scanner.js'
import { vulnScanTarget } from './vulnScanner.js'
import { printBanner, logScan, logError } from './banner.js'
import { getThreats, setThreatStatus, addListener, lastPollTime, dataSources, startThreatMonitor } from './threatMonitor.js'
import { portScan, PORT_PRESETS, parsePortSpec } from './portScanner.js'
import { SHERLOCK_SITES } from './sherlockSites.js'
import { analyzeNetworks } from './wirelessAnalyzer.js'
import { loadLocalJson, saveLocalJson } from './localStore.js'
import { createPayloadRouter } from './payloadBuilder.js'

const app = express()
const PORT = 3001
const execFileAsync = promisify(execFile)
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))

app.disable('x-powered-by')
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  next()
})
app.use(express.json({ limit: '64kb' }))

// ── API key auth ──────────────────────────────────────────────────────────────

const API_KEY = process.env.CYBERWEB_API_KEY || ''

if (!API_KEY) {
  console.error('[auth] CYBERWEB_API_KEY is not set. Add it to your .env file and restart the server.')
  console.error('[auth] Example:  CYBERWEB_API_KEY=your-secret-key-here')
  process.exit(1)
}
startThreatMonitor()

function requireApiKey(req, res, next) {
  const provided = req.headers['x-api-key']
  if (provided !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

app.use('/api/payloads', createPayloadRouter(requireApiKey))

// ── Server-side state ─────────────────────────────────────────────────────────

const restoredActivity = loadLocalJson('activity.json', [])
const activityLog = (Array.isArray(restoredActivity) ? restoredActivity : []).slice(0, 100)
const activeScans = new Map()
const MAX_ACTIVE_SCANS = 2
let scanIdCounter = 0
let totalScansRun = 0
const serverStart = Date.now()

function addActivity(entry) {
  activityLog.unshift({ id: randomUUID(), ...entry, timestamp: new Date().toISOString() })
  if (activityLog.length > 100) activityLog.pop()
  try { saveLocalJson('activity.json', activityLog) }
  catch (err) { console.warn(`[activity] Could not save local history: ${err.message}`) }
}

// Git checkpoint helper
async function git(args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: REPO_ROOT,
      timeout: options.timeout || 60000,
      maxBuffer: 1024 * 1024 * 4,
    })
    return { stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (err) {
    const output = (err.stderr || err.stdout || err.message || 'Git command failed').trim()
    throw new Error(output)
  }
}

async function isGitRepo() {
  try {
    const { stdout } = await git(['rev-parse', '--is-inside-work-tree'])
    return stdout === 'true'
  } catch {
    return false
  }
}

function validateBranch(branch) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(branch) ||
      branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.lock'))
    throw new Error('Invalid branch name')
  return branch
}

function validateRemoteUrl(url) {
  if (!url) return
  if (/^git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(url)) return
  if (/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(url)) return
  throw new Error('Only GitHub HTTPS or SSH repository URLs are accepted')
}

async function switchBranch(branch) {
  const target = validateBranch(branch)
  const current = (await git(['branch', '--show-current']).catch(() => ({ stdout: '' }))).stdout
  if (current === target) return
  const exists = await git(['show-ref', '--verify', '--quiet', `refs/heads/${target}`]).then(() => true, () => false)
  await git(exists ? ['switch', target] : ['switch', '-c', target])
}

function sensitiveCheckpointPath(path) {
  const value = path.replace(/\\/g, '/').toLowerCase()
  const name = value.split('/').pop()
  return (name === '.env' || (name.startsWith('.env.') && name !== '.env.example') ||
    /\.(pem|p12|pfx|key|keystore)$/.test(name) || /^id_(rsa|dsa|ecdsa|ed25519)$/.test(name))
}

function parseShortStatus(raw) {
  return raw
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line && !line.startsWith('## '))
    .map(line => ({
      code: line.slice(0, 2).trim() || '??',
      path: line.slice(3),
    }))
}

async function ensureGitignore() {
  const gitignorePath = `${REPO_ROOT}/.gitignore`
  const required = [
    '.claude/',
    'node_modules/',
    'dist/',
    '.env',
    '.env.*',
    '*.log',
    '.DS_Store',
  ]

  let existing = ''
  try {
    existing = await fs.readFile(gitignorePath, 'utf8')
  } catch {
    // Create it below.
  }

  const missing = required.filter(pattern => !existing.split(/\r?\n/).includes(pattern))
  if (!missing.length) return []

  const prefix = existing && !existing.endsWith('\n') ? '\n' : ''
  await fs.appendFile(gitignorePath, `${prefix}${missing.join('\n')}\n`)
  return missing
}

async function getCheckpointStatus() {
  const repo = await isGitRepo()
  if (!repo) {
    return {
      repo: false,
      root: REPO_ROOT,
      branch: '',
      upstream: '',
      ahead: 0,
      behind: 0,
      changes: [],
      remotes: [],
      lastCommit: null,
    }
  }

  const [{ stdout: status }, { stdout: remotesRaw }, branchResult] = await Promise.all([
    git(['status', '--short', '--branch']),
    git(['remote', '-v']).catch(() => ({ stdout: '' })),
    git(['branch', '--show-current']).catch(() => ({ stdout: '' })),
  ])

  const branchLine = status.split('\n').find(line => line.startsWith('## ')) || ''
  const upstream = (branchLine.match(/\.\.\.([^\s\[]+)/) || [])[1] || ''
  const ahead = Number((branchLine.match(/ahead (\d+)/) || [])[1] || 0)
  const behind = Number((branchLine.match(/behind (\d+)/) || [])[1] || 0)
  const remotes = [...new Map(
    remotesRaw
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [name, url, kind] = line.split(/\s+/)
        return [`${name}:${kind}`, { name, url, kind: kind?.replace(/[()]/g, '') || '' }]
      })
  ).values()]

  let lastCommit = null
  try {
    const { stdout } = await git(['log', '-1', '--pretty=format:%h%x00%s%x00%cr%x00%an'])
    const [hash, subject, when, author] = stdout.split('\x00')
    lastCommit = { hash, subject, when, author }
  } catch {
    // No commits yet.
  }

  return {
    repo,
    root: REPO_ROOT,
    branch: branchResult.stdout || '',
    upstream,
    ahead,
    behind,
    changes: parseShortStatus(status),
    remotes,
    lastCommit,
  }
}

// ── CPU sampling ──────────────────────────────────────────────────────────────

function getCpuPercent() {
  const sample = () => os.cpus().reduce(
    (acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
      return { idle: acc.idle + cpu.times.idle, total: acc.total + total }
    },
    { idle: 0, total: 0 }
  )
  return new Promise(resolve => {
    const s1 = sample()
    setTimeout(() => {
      const s2 = sample()
      const pct = Math.round((1 - (s2.idle - s1.idle) / (s2.total - s1.total)) * 100)
      resolve(Math.max(0, Math.min(100, pct)))
    }, 200)
  })
}

// ── SSE helper ────────────────────────────────────────────────────────────────

function sseHandler(res, fn) {
  const controller = new AbortController()
  res.on('close', () => controller.abort())
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  fn(send, controller.signal)
    .catch(err => {
      if (controller.signal.aborted) return
      const msg = err instanceof Error ? err.message : String(err)
      logError(msg)
      send('scan_error', { message: msg })
    })
    .finally(() => { if (!res.writableEnded) res.end() })
}

// ── Network recon ─────────────────────────────────────────────────────────────

app.get('/api/scan', requireApiKey, (req, res) => {
  if (activeScans.size >= MAX_ACTIVE_SCANS) return res.status(429).json({ error: 'Scan limit reached; wait for an active scan to finish.' })
  const { target, mode = 'Standard' } = req.query
  if (!target || typeof target !== 'string')
    return res.status(400).json({ error: 'target is required' })

  const scanId = ++scanIdCounter
  const modeStr = typeof mode === 'string' ? mode : 'Standard'
  activeScans.set(scanId, { name: 'Network Recon', target, startTime: Date.now() })
  res.on('close', () => activeScans.delete(scanId))

  sseHandler(res, (send, signal) => {
    const intercepted = (event, data) => {
      send(event, data)
      if (event === 'start') {
        totalScansRun++
        logScan('recon', target, modeStr, 'start')
      }
      if (event === 'complete') {
        activeScans.delete(scanId)
        logScan('recon', target, modeStr, 'complete', `${data.total} hosts`)
        addActivity({
          type: 'scan', severity: 'info',
          message: `Network recon complete — ${data.total} host${data.total !== 1 ? 's' : ''} scanned on ${target}`,
          tool: 'Network Recon',
        })
      }
    }
    return scanTarget(target, modeStr, intercepted, signal)
  })
})

// ── Vulnerability scan ────────────────────────────────────────────────────────

app.get('/api/vuln-scan', requireApiKey, (req, res) => {
  if (activeScans.size >= MAX_ACTIVE_SCANS) return res.status(429).json({ error: 'Scan limit reached; wait for an active scan to finish.' })
  const { target, mode = 'Standard' } = req.query
  if (!target || typeof target !== 'string')
    return res.status(400).json({ error: 'target is required' })

  const scanId = ++scanIdCounter
  const modeStr = typeof mode === 'string' ? mode : 'Standard'
  activeScans.set(scanId, { name: 'Vuln Scanner', target, startTime: Date.now() })
  res.on('close', () => activeScans.delete(scanId))

  sseHandler(res, (send, signal) => {
    const intercepted = (event, data) => {
      send(event, data)
      if (event === 'start') {
        totalScansRun++
        logScan('vuln', target, modeStr, 'start')
      }
      if (event === 'complete') {
        activeScans.delete(scanId)
        logScan('vuln', target, modeStr, 'complete', `${data.hostsScanned} hosts · ${data.findingsTotal} findings`)
        const sev = data.findingsTotal >= 5 ? 'high' : data.findingsTotal > 0 ? 'medium' : 'info'
        addActivity({
          type: data.findingsTotal > 0 ? 'alert' : 'scan',
          severity: sev,
          message: `Vulnerability scan complete — ${data.hostsScanned} host${data.hostsScanned !== 1 ? 's' : ''}, ${data.findingsTotal} finding${data.findingsTotal !== 1 ? 's' : ''} on ${target}`,
          tool: 'Vulnerability Scanner',
        })
      }
    }
    return vulnScanTarget(target, modeStr, intercepted, signal)
  })
})

// ── Port Scanner ──────────────────────────────────────────────────────────────

app.get('/api/port-scan', requireApiKey, (req, res) => {
  if (activeScans.size >= MAX_ACTIVE_SCANS) return res.status(429).json({ error: 'Scan limit reached; wait for an active scan to finish.' })
  const { target, ports, mode, timeout } = req.query
  if (!target || typeof target !== 'string')
    return res.status(400).json({ error: 'target is required' })

  const portSpec = (mode && PORT_PRESETS[mode])
    ? PORT_PRESETS[mode].join(',')
    : (typeof ports === 'string' ? ports : PORT_PRESETS.Standard.join(','))

  const timeoutMs = Math.min(Math.max(parseInt(timeout) || 1000, 300), 5000)

  const scanId = ++scanIdCounter
  activeScans.set(scanId, { name: 'Port Scanner', target, startTime: Date.now() })
  res.on('close', () => activeScans.delete(scanId))

  sseHandler(res, (send, signal) => {
    const intercepted = (event, data) => {
      send(event, data)
      if (event === 'start') {
        totalScansRun++
        logScan('ports', target, mode || 'custom', 'start')
      }
      if (event === 'complete') {
        activeScans.delete(scanId)
        logScan('ports', target, mode || 'custom', 'complete', `${data.open} open / ${data.total} ports`)
        addActivity({
          type: data.open > 0 ? 'alert' : 'scan',
          severity: data.open > 10 ? 'high' : data.open > 0 ? 'medium' : 'info',
          message: `Port scan complete — ${data.open} open port${data.open !== 1 ? 's' : ''} on ${target}`,
          tool: 'Port Scanner',
        })
      }
    }
    return portScan(target, portSpec, intercepted, timeoutMs, signal)
  })
})

// ── Threat Monitor ────────────────────────────────────────────────────────────

app.get('/api/threats', requireApiKey, (_req, res) => {
  res.json({ threats: getThreats(), lastPollTime, dataSources })
})

app.get('/api/threats/stream', requireApiKey, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const remove = addListener((event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  })
  req.on('close', remove)
})

app.patch('/api/threats/:id/status', requireApiKey, (req, res) => {
  const { status } = req.body
  const valid = ['active', 'acknowledged', 'monitoring', 'investigating', 'resolved']
  if (!valid.includes(status)) return res.status(400).json({ error: 'invalid status' })
  const threat = setThreatStatus(req.params.id, status)
  if (!threat) return res.status(404).json({ error: 'not found' })
  res.json(threat)
})

// ── Health & activity ─────────────────────────────────────────────────────────

app.get('/api/health', requireApiKey, async (req, res) => {
  const cpu = await getCpuPercent()
  const memPct = Math.round((1 - os.freemem() / os.totalmem()) * 100)
  res.json({
    cpu,
    memory: memPct,
    uptimeSeconds: Math.floor((Date.now() - serverStart) / 1000),
    totalScansRun,
    activeScans: [...activeScans.values()].map(s => ({
      name: s.name,
      target: s.target,
      elapsedSeconds: Math.floor((Date.now() - s.startTime) / 1000),
    })),
  })
})

app.get('/api/activity', requireApiKey, (_req, res) => {
  res.json(activityLog)
})

// Code checkpoint / GitHub submit
app.get('/api/checkpoint/status', requireApiKey, async (_req, res) => {
  try {
    res.json(await getCheckpointStatus())
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unable to read Git status' })
  }
})

app.post('/api/checkpoint/init', requireApiKey, async (req, res) => {
  const { remoteUrl = '', branch = 'main', protectGenerated = true } = req.body || {}
  const steps = []

  try {
    validateRemoteUrl(remoteUrl.trim())
    if (!(await isGitRepo())) {
      await git(['init'])
      steps.push('Initialized Git repository')
    }

    if (branch?.trim()) {
      await switchBranch(branch.trim())
      steps.push(`Checked out ${branch.trim()}`)
    }

    if (protectGenerated) {
      const ignored = await ensureGitignore()
      if (ignored.length) steps.push(`Updated .gitignore (${ignored.join(', ')})`)
    }

    if (remoteUrl?.trim()) {
      const remoteName = 'origin'
      const hasOrigin = (await git(['remote']).catch(() => ({ stdout: '' }))).stdout.split('\n').includes(remoteName)
      if (hasOrigin) {
        await git(['remote', 'set-url', remoteName, remoteUrl.trim()])
        steps.push('Updated origin remote')
      } else {
        await git(['remote', 'add', remoteName, remoteUrl.trim()])
        steps.push('Added origin remote')
      }
    }

    res.json({ ok: true, steps, status: await getCheckpointStatus() })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unable to initialize repository', steps })
  }
})

app.post('/api/checkpoint/run', requireApiKey, async (req, res) => {
  const {
    message = '',
    push = false,
    remote = 'origin',
    branch = 'main',
    remoteUrl = '',
    protectGenerated = true,
    pushStrategy = 'normal', // 'normal' | 'rebase' | 'force'
    expectedChanges,
  } = req.body || {}
  const steps = []

  try {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,50}$/.test(remote)) throw new Error('Invalid remote name')
    if (!['normal', 'rebase', 'force'].includes(pushStrategy)) throw new Error('Invalid push strategy')
    validateRemoteUrl(remoteUrl.trim())
    if (!(await isGitRepo()))
      return res.status(400).json({ error: 'Initialize the repository and review its files before checkpointing.', steps })

    const branchResult = await git(['branch', '--show-current']).catch(() => ({ stdout: '' }))
    const targetBranch = branch?.trim() || branchResult.stdout || 'main'
    validateBranch(targetBranch)
    if (branchResult.stdout !== targetBranch)
      return res.status(409).json({ error: 'Switch branches with Initialize / Connect, then refresh and review files before checkpointing.', steps })
    steps.push(`Using branch ${targetBranch}`)

    const before = await getCheckpointStatus()
    if (!Array.isArray(expectedChanges) || JSON.stringify(before.changes) !== JSON.stringify(expectedChanges))
      return res.status(409).json({ error: 'Working tree changed since preview. Refresh status and review files before committing.', steps })
    const sensitive = before.changes.map(change => change.path).filter(sensitiveCheckpointPath)
    if (sensitive.length) throw new Error(`Refusing to stage potential secret files: ${sensitive.join(', ')}`)

    if (protectGenerated) {
      const ignored = await ensureGitignore()
      if (ignored.length) steps.push(`Updated .gitignore (${ignored.join(', ')})`)
    }

    if (remoteUrl?.trim()) {
      const remotes = (await git(['remote']).catch(() => ({ stdout: '' }))).stdout.split('\n')
      if (remotes.includes(remote)) {
        await git(['remote', 'set-url', remote, remoteUrl.trim()])
        steps.push(`Updated ${remote} remote`)
      } else {
        await git(['remote', 'add', remote, remoteUrl.trim()])
        steps.push(`Added ${remote} remote`)
      }
    }

    await git(['add', '-A'], { timeout: 120000 })
    steps.push('Staged working tree')

    const staged = (await git(['diff', '--cached', '--name-only'])).stdout
    const stagedSecrets = staged.split('\n').filter(Boolean).filter(sensitiveCheckpointPath)
    if (stagedSecrets.length) throw new Error(`Refusing to commit potential secret files: ${stagedSecrets.join(', ')}`)
    let commit = null
    if (staged) {
      const cleanMessage = message.trim() || `Checkpoint ${new Date().toLocaleString('en-US')}`
      await git(['commit', '-m', cleanMessage], { timeout: 120000 })
      const { stdout } = await git(['log', '-1', '--pretty=format:%h%x00%s'])
      const [hash, subject] = stdout.split('\x00')
      commit = { hash, subject }
      steps.push(`Created commit ${hash}`)
      addActivity({ type: 'info', severity: 'info', message: `Checkpoint: ${subject} [${hash}]`, tool: 'Code Checkpoint' })
    } else {
      steps.push('No file changes to commit')
    }

    let pushed = false
    if (push) {
      const remotes = (await git(['remote']).catch(() => ({ stdout: '' }))).stdout.split('\n').filter(Boolean)
      if (!remotes.includes(remote)) {
        steps.push(`Skipped push: ${remote} remote is not configured`)
      } else {
        const configuredUrl = (await git(['remote', 'get-url', remote])).stdout
        validateRemoteUrl(configuredUrl)
        if (pushStrategy === 'rebase') {
          await git(['pull', '--rebase', remote, targetBranch], { timeout: 60000 })
          steps.push(`Pulled and rebased from ${remote}/${targetBranch}`)
        }
        const pushArgs = ['push', '-u', remote, targetBranch]
        if (pushStrategy === 'force') pushArgs.push('--force-with-lease')
        await git(pushArgs, { timeout: 180000 })
        pushed = true
        steps.push(pushStrategy === 'force'
          ? `Force-pushed ${targetBranch} to ${remote}`
          : `Pushed ${targetBranch} to ${remote}`)
      }
    }

    res.json({ ok: true, commit, pushed, steps, status: await getCheckpointStatus() })
  } catch (err) {
    const isPushRejected = /rejected|fetch first|non-fast-forward/i.test(err.message || '')
    res.status(500).json({ error: err.message || 'Checkpoint failed', steps, pushRejected: isPushRejected })
  }
})

app.get('/api/checkpoint/log', requireApiKey, async (_req, res) => {
  try {
    if (!(await isGitRepo())) return res.json([])
    const { stdout } = await git([
      'log',
      '--pretty=format:%x00%h%x1f%s%x1f%cr%x1f%an',
      '--shortstat',
      '-n', '30',
    ])
    const commits = stdout
      .split('\x00')
      .filter(Boolean)
      .map(chunk => {
        const lines = chunk.trim().split('\n').filter(Boolean)
        const [hash, subject, when, author] = (lines[0] || '').split('\x1f')
        const statLine = lines.find(l => l.includes('changed')) || ''
        const filesMatch = statLine.match(/(\d+) file/)
        const insMatch   = statLine.match(/(\d+) insertion/)
        const delMatch   = statLine.match(/(\d+) deletion/)
        return {
          hash:       hash?.trim(),
          subject:    subject?.trim(),
          when:       when?.trim(),
          author:     author?.trim(),
          files:      filesMatch ? parseInt(filesMatch[1]) : 0,
          insertions: insMatch   ? parseInt(insMatch[1])   : 0,
          deletions:  delMatch   ? parseInt(delMatch[1])   : 0,
        }
      })
      .filter(c => c.hash)
    res.json(commits)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/checkpoint/note', requireApiKey, (req, res) => {
  const { message, severity = 'info' } = req.body || {}
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' })
  const valid = ['critical', 'high', 'medium', 'low', 'info']
  addActivity({
    type: 'info',
    severity: valid.includes(severity) ? severity : 'info',
    message: message.trim(),
    tool: 'Code Checkpoint',
  })
  res.json({ ok: true })
})

// ── Wireless Scanner ──────────────────────────────────────────────────────────

function parseNetshWifi(raw) {
  const networks = []
  let net = null
  let bssid = null

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const g = (pat) => { const m = line.match(pat); return m ? m[1].trim() : null }

    // SSID N : name  (but not BSSID lines)
    const ssid = g(/^SSID\s+\d+\s*:\s*(.*)$/)
    if (ssid !== null && !line.startsWith('BSSID')) {
      if (net) networks.push(net)
      net = { ssid, authentication: '', encryption: '', networkType: '', bssids: [] }
      bssid = null
      continue
    }

    if (!net) continue

    const nt = g(/^Network type\s*:\s*(.+)$/); if (nt) { net.networkType = nt; continue }
    const auth = g(/^Authentication\s*:\s*(.+)$/); if (auth) { net.authentication = auth; continue }
    const enc = g(/^Encryption\s*:\s*(.+)$/); if (enc) { net.encryption = enc; continue }

    const mac = g(/^BSSID\s+\d+\s*:\s*(.+)$/)
    if (mac) {
      bssid = { mac, signal: 0, radioType: '', channel: '' }
      net.bssids.push(bssid)
      continue
    }

    if (bssid) {
      const sig = line.match(/^Signal\s*:\s*(\d+)%/)
      if (sig) { bssid.signal = parseInt(sig[1]); continue }
      const rt = g(/^Radio type\s*:\s*(.+)$/); if (rt) { bssid.radioType = rt; continue }
      const ch = g(/^Channel\s*:\s*(\d+)$/); if (ch) { bssid.channel = ch; continue }
    }
  }

  if (net) networks.push(net)
  return networks
}

function parseNmcliWifi(raw) {
  // nmcli -t -f SSID,BSSID,SIGNAL,SECURITY,CHAN dev wifi list
  // Line format: SSID:AA\:BB\:CC\:DD\:EE\:FF:SIGNAL:SECURITY:CHAN
  const networks = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const m = line.match(/^(.*):([0-9A-Fa-f]{2}(?:\\:[0-9A-Fa-f]{2}){5}):(\d+):([^:]*):(\d*)$/)
    if (!m) continue
    const [, ssid, bssidRaw, signalStr, security, channel] = m
    const mac = bssidRaw.replace(/\\/g, '')
    const signal = parseInt(signalStr)
    const existing = networks.find(n => n.ssid === ssid)
    if (existing) {
      existing.bssids.push({ mac, signal, radioType: '', channel })
    } else {
      networks.push({
        ssid,
        authentication: security || 'Open',
        encryption: '',
        networkType: 'Infrastructure',
        bssids: [{ mac, signal, radioType: '', channel }],
      })
    }
  }
  return networks
}

app.get('/api/wireless-scan', requireApiKey, async (req, res) => {
  try {
    let networks = []

    if (process.platform === 'win32') {
      let stdout
      try {
        ;({ stdout } = await execFileAsync('netsh', ['wlan', 'show', 'networks', 'mode=bssid'], { timeout: 12000 }))
      } catch (err) {
        const msg = ((err.stderr || '') + (err.message || '')).toLowerCase()
        if (msg.includes('no wireless interface') || msg.includes('wlan autoconfig') || msg.includes('not running')) {
          return res.status(503).json({ error: 'No wireless interface found. Enable your WiFi adapter and try again.' })
        }
        throw err
      }
      networks = parseNetshWifi(stdout)
    } else if (process.platform === 'linux') {
      try {
        const { stdout } = await execFileAsync(
          'nmcli', ['-t', '-f', 'SSID,BSSID,SIGNAL,SECURITY,CHAN', 'dev', 'wifi', 'list'],
          { timeout: 12000 },
        )
        networks = parseNmcliWifi(stdout)
      } catch {
        return res.status(503).json({ error: 'nmcli not found. Install NetworkManager to enable wireless scanning.' })
      }
    } else {
      return res.status(501).json({ error: `Wireless scanning is not supported on ${process.platform}.` })
    }

    const findings = analyzeNetworks(networks)
    res.json({ networks, findings, scannedAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Wireless scan failed' })
  }
})

// ── Sherlock username search ──────────────────────────────────────────────────

const SHERLOCK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const SHERLOCK_TIMEOUT = 8000
const SHERLOCK_BATCH = 20

// ── Headless browser pool ─────────────────────────────────────────────────────
// Used for phase-2 verification: renders JS SPAs and checks actual visible content.

let _browser = null
const BROWSER_CONCURRENCY = 4
let _browserSlots = BROWSER_CONCURRENCY
const _browserQueue = []

async function getBrowser() {
  if (!_browser) {
    const { default: puppeteer } = await import('puppeteer')
    _browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    _browser.on('disconnected', () => { _browser = null })
  }
  return _browser
}

function acquireSlot() {
  return new Promise(resolve => {
    if (_browserSlots > 0) { _browserSlots--; resolve() }
    else _browserQueue.push(resolve)
  })
}

function releaseSlot() {
  if (_browserQueue.length > 0) _browserQueue.shift()()
  else _browserSlots++
}

// Substrings in the final URL that indicate an auth/login wall rather than a true "not found" redirect.
// When the browser lands here we can't tell if the account exists — return inconclusive.
const LOGIN_WALL_INDICATORS = [
  '/login', '/signin', '/sign-in', '/accounts/login', '/account/login',
  '/challenge', 'oauth/authorize', '/auth/', '/session', '/register',
]

// Returns { found: boolean|null, reason: string }
// null = inconclusive (bot block / crash / login wall) — caller keeps the fetch result
// wasUncertain: true when the site was already flagged as bot-protected by the fetch phase.
//               These sites redirect headless browsers to login walls routinely even when the
//               account exists — so a redirect alone must not count as "not found".
async function browserVerify(url, username, wasUncertain = false) {
  await acquireSlot()
  let page = null
  try {
    const browser = await getBrowser()
    page = await browser.newPage()
    await page.setUserAgent(SHERLOCK_UA)
    await page.setViewport({ width: 1280, height: 800 })

    // Block heavy assets — we only need text content
    await page.setRequestInterception(true)
    page.on('request', req => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort()
      else req.continue()
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await new Promise(r => setTimeout(r, 2500)) // longer settle — gives SPAs time to hydrate

    const finalUrl   = page.url().toLowerCase()
    const title      = (await page.title()).toLowerCase()
    const bodyText   = await page.evaluate(() => (document.body?.innerText ?? '').slice(0, 8000))
    const outerHtml  = await page.evaluate(() => (document.documentElement?.outerHTML ?? '').slice(0, 12000))
    const uname      = username.toLowerCase()
    const combined   = `${title} ${bodyText} ${outerHtml}`.toLowerCase()

    // ── Login / auth wall ─────────────────────────────────────────────────────
    // Headless Chrome often triggers bot protection that redirects to login pages
    // even when the account exists. We can't determine existence — stay inconclusive.
    if (LOGIN_WALL_INDICATORS.some(i => finalUrl.includes(i))) {
      return { found: null, reason: 'login_wall' }
    }

    // ── JS redirect ───────────────────────────────────────────────────────────
    // The server moved us away from the profile URL after JS ran.
    if (!finalUrl.includes(uname)) {
      // For originally-uncertain (bot-protected) sites, a redirect is ambiguous — stay inconclusive.
      if (wasUncertain) return { found: null, reason: 'uncertain_redirect' }
      return { found: false, reason: 'js_redirect' }
    }

    // ── Content checks (apply to all remaining cases) ─────────────────────────
    // Prominent 404 in rendered title or visible body top
    if (/\b404\b/.test(title) || /\b404\b/.test(bodyText.slice(0, 300)))
      return { found: false, reason: '404_visible' }

    // Stale patterns in fully-rendered content (catches JS-rendered error messages)
    if (STALE_PATTERNS.some(p => combined.includes(p)))
      return { found: false, reason: 'stale_pattern' }

    // Username must appear somewhere in the rendered page
    if (!combined.includes(uname))
      return { found: false, reason: 'no_username' }

    return { found: true, reason: 'verified' }
  } catch {
    return { found: null, reason: 'error' }
  } finally {
    if (page) await page.close().catch(() => {})
    releaseSlot()
  }
}

// Patterns that indicate "not found" even when HTTP status is 200.
// Checked case-insensitively against first 10KB of body for all sites.
const STALE_PATTERNS = [
  // Account / profile missing
  "sorry, this page isn't available",
  "this account doesn't exist",
  "this profile doesn't exist",
  "account not found",
  "user not found",
  "profile not found",
  "couldn't find this account",
  "we couldn't find that user",
  "the requested user was not found",
  "no such user",
  "no users found",
  "there is no user",
  "this user does not exist",
  "user doesn't exist",
  // Page / URL missing
  "page not found",
  "this page doesn't exist",
  "this page isn't available",
  "this page is unavailable",
  "the page you requested was not found",
  "the page you're looking for doesn't exist",
  "sorry, that page doesn't exist",
  "sorry, we can't find the page",
  "we can't find this page",
  "couldn't find this page",
  "hmm...this page doesn't exist",
  "oops! that page can't be found",
  "looks like this page doesn't exist",
  "the link you followed may be broken",
  "this channel doesn't exist",
  "404 not found",
  // Title-based (HTML <title> tag)
  "<title>error</title>",
  "<title>not found</title>",
  "<title>page not found</title>",
  "<title>404</title>",
  "<title>user not found</title>",
  "<title>profile not found</title>",
  // Redirect to auth pages (followed redirects can land here)
  "<title>sign up</title>",
  "<title>signup</title>",
  "<title>log in</title>",
  "<title>login</title>",
  "<title>register</title>",
  "<title>create an account</title>",
  // Specific platform patterns
  "this account has been suspended",
  "this account has been deactivated",
  "this content isn't available right now",
  // Link-in-bio and identity platform errors
  "can't seem to find a bio",
  "well that was unexpected",
  "we couldn't find this page",
  "this page is no longer available",
  "this profile has been removed",
  "no profile found",
  "this user hasn't set up",
  "we couldn't find what you were looking for",
]

async function readPartialBody(res, maxBytes = 10000) {
  try {
    const reader = res.body.getReader()
    const chunks = []
    let total = 0
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
    reader.cancel().catch(() => {})
    return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8').slice(0, maxBytes)
  } catch {
    return ''
  }
}

function isStale(body) {
  const lower = body.toLowerCase()
  return STALE_PATTERNS.some(p => lower.includes(p))
}

async function checkSite(site, username) {
  const displayUrl = site.url.replace('{}', encodeURIComponent(username))

  // JS SPAs / heavily bot-protected: server always returns 200 + JS bundle.
  // Body checking is impossible. Return as a manual-verification link instead.
  if (site.uncertain) {
    return { ...site, url: displayUrl, found: false, uncertain: true, responseTime: 0 }
  }

  // Use JSON API endpoint when available — gives reliable 404s for missing users.
  const checkUrl = site.apiUrl
    ? site.apiUrl.replace('{}', encodeURIComponent(username))
    : displayUrl

  const start = Date.now()
  try {
    const res = await fetch(checkUrl, {
      method: 'GET',
      headers: {
        'User-Agent': SHERLOCK_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': site.apiUrl
          ? 'application/json'
          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(SHERLOCK_TIMEOUT),
      redirect: 'follow',
    })
    const responseTime = Date.now() - start

    // Hard 404/403/410 → not found
    if ([404, 403, 410].includes(res.status)) {
      return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
    }

    if (res.status === 200) {
      // ── Layer 1: Redirect guard ────────────────────────────────────────────────
      // If the server redirected us away from the profile URL (to /login, /, /signup,
      // or a generic 404 page), the username will have disappeared from the final URL.
      // This catches the most common false-positive pattern without reading the body.
      if (!site.skipRedirectCheck) {
        const finalUrl = res.url.toLowerCase()
        if (!finalUrl.includes(username.toLowerCase())) {
          return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
        }
      }

      const body = await readPartialBody(res)

      // ── API-specific handling ─────────────────────────────────────────────────
      // Some APIs (Hacker News) return literal "null" for missing users
      if (site.apiUrl && body.trim() === 'null') {
        return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
      }
      // API check passed — user data was returned in the JSON body
      if (site.apiUrl) {
        return { ...site, url: displayUrl, found: true, responseTime, httpStatus: res.status }
      }

      // ── Layer 2: HTML content checks ──────────────────────────────────────────
      // Site-specific error message
      if (site.errorType === 'message' && site.errorMsg) {
        if (body.toLowerCase().includes(site.errorMsg.toLowerCase())) {
          return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
        }
      }

      // Generic stale page detection (title tags, "not found" phrases, auth page titles)
      if (isStale(body)) {
        return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
      }

      // ── Layer 3: Size guard ───────────────────────────────────────────────────
      // A real profile page is never < 500 bytes. Tiny responses are either a
      // JSON stub or a minimally-rendered error page we missed above.
      if (body.length < 500) {
        return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
      }

      // ── Layer 4: Username presence check (status_code sites only) ─────────────
      // For sites that only rely on HTTP status, additionally verify that the
      // username string appears somewhere in the page content. Skipped for sites
      // where SSR may not inline the username (SPAs, heavy client rendering).
      if (site.errorType === 'status_code' && !site.skipPresenceCheck) {
        if (!body.toLowerCase().includes(username.toLowerCase())) {
          return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
        }
      }

      return { ...site, url: displayUrl, found: true, responseTime, httpStatus: res.status }
    }

    // Redirects, 5xx → not found
    return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
  } catch {
    return { ...site, url: displayUrl, found: false, responseTime: Date.now() - start, httpStatus: 0, error: 'timeout' }
  }
}

app.get('/api/sherlock', requireApiKey, (req, res) => {
  const { username } = req.query
  if (!username || typeof username !== 'string' || username.length < 1)
    return res.status(400).json({ error: 'username is required' })
  if (!/^[a-zA-Z0-9._\-]{1,50}$/.test(username))
    return res.status(400).json({ error: 'invalid username' })

  sseHandler(res, async (send, signal) => {
    send('start', { total: SHERLOCK_SITES.length, username })

    // Phase 1: fast fetch-based checks (batched, streamed live)
    const fetchResults = []
    for (let i = 0; i < SHERLOCK_SITES.length; i += SHERLOCK_BATCH) {
      if (signal.aborted) return
      const batch = SHERLOCK_SITES.slice(i, i + SHERLOCK_BATCH)
      const batchResults = await Promise.all(batch.map(site => checkSite(site, username)))
      if (signal.aborted) return
      for (const r of batchResults) {
        send('result', r)
        fetchResults.push(r)
      }
    }

    // Phase 2: headless browser verification of all positive + uncertain results.
    // The browser renders JS, follows client-side redirects, and checks visible text.
    const toVerify = fetchResults.filter(r => r.found || r.uncertain)
    if (toVerify.length > 0) {
      send('verify_start', { total: toVerify.length })
      await Promise.all(toVerify.map(async (result) => {
        if (signal.aborted) return
        const vr = await browserVerify(result.url, username, result.uncertain === true)
        if (signal.aborted) return
        send('verify_result', {
          ...result,
          found:           vr.found ?? result.found,
          uncertain:       vr.found === null ? result.uncertain : false,
          browserVerified: vr.found !== null,
          verifyReason:    vr.reason,
        })
      }))
    }

    if (!signal.aborted) send('complete', { username, total: SHERLOCK_SITES.length })
  })
})

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  if (process.env.NO_BANNER === '1') {
    process.stdout.write('SERVER_READY\n')
  } else {
    printBanner('api', PORT)
  }
})
