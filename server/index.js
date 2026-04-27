import os from 'os'
import fs from 'fs/promises'
import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { scanTarget } from './scanner.js'
import { vulnScanTarget } from './vulnScanner.js'
import { printBanner, logScan, logError } from './banner.js'
import { getThreats, setThreatStatus, addListener, lastPollTime, dataSources } from './threatMonitor.js'
import { portScan, PORT_PRESETS, parsePortSpec } from './portScanner.js'
import { registerPhishingRoutes } from './phishingServer.js'

const app = express()
const PORT = 3001
const execFileAsync = promisify(execFile)
const REPO_ROOT = process.cwd()

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json())

// ── Server-side state ─────────────────────────────────────────────────────────

const activityLog = []
const activeScans = new Map()
let scanIdCounter = 0
let totalScansRun = 0
const serverStart = Date.now()

function addActivity(entry) {
  activityLog.unshift({ id: Date.now().toString(), ...entry, timestamp: new Date().toISOString() })
  if (activityLog.length > 20) activityLog.pop()
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
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  fn(send)
    .catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      logError(msg)
      send('scan_error', { message: msg })
    })
    .finally(() => { if (!res.writableEnded) res.end() })
}

// ── Network recon ─────────────────────────────────────────────────────────────

app.get('/api/scan', (req, res) => {
  const { target, mode = 'Standard' } = req.query
  if (!target || typeof target !== 'string')
    return res.status(400).json({ error: 'target is required' })

  const scanId = ++scanIdCounter
  const modeStr = typeof mode === 'string' ? mode : 'Standard'
  totalScansRun++
  activeScans.set(scanId, { name: 'Network Recon', target, startTime: Date.now() })
  res.on('close', () => activeScans.delete(scanId))

  logScan('recon', target, modeStr, 'start')

  sseHandler(res, send => {
    const intercepted = (event, data) => {
      send(event, data)
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
    return scanTarget(target, modeStr, intercepted)
  })
})

// ── Vulnerability scan ────────────────────────────────────────────────────────

app.get('/api/vuln-scan', (req, res) => {
  const { target, mode = 'Standard' } = req.query
  if (!target || typeof target !== 'string')
    return res.status(400).json({ error: 'target is required' })

  const scanId = ++scanIdCounter
  const modeStr = typeof mode === 'string' ? mode : 'Standard'
  totalScansRun++
  activeScans.set(scanId, { name: 'Vuln Scanner', target, startTime: Date.now() })
  res.on('close', () => activeScans.delete(scanId))

  logScan('vuln', target, modeStr, 'start')

  sseHandler(res, send => {
    const intercepted = (event, data) => {
      send(event, data)
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
    return vulnScanTarget(target, modeStr, intercepted)
  })
})

// ── Port Scanner ──────────────────────────────────────────────────────────────

app.get('/api/port-scan', (req, res) => {
  const { target, ports, mode, timeout } = req.query
  if (!target || typeof target !== 'string')
    return res.status(400).json({ error: 'target is required' })

  const portSpec = (mode && PORT_PRESETS[mode])
    ? PORT_PRESETS[mode].join(',')
    : (typeof ports === 'string' ? ports : PORT_PRESETS.Standard.join(','))

  const timeoutMs = Math.min(Math.max(parseInt(timeout) || 1000, 300), 5000)

  const scanId = ++scanIdCounter
  totalScansRun++
  activeScans.set(scanId, { name: 'Port Scanner', target, startTime: Date.now() })
  res.on('close', () => activeScans.delete(scanId))

  logScan('ports', target, mode || 'custom', 'start')

  sseHandler(res, send => {
    const intercepted = (event, data) => {
      send(event, data)
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
    return portScan(target, portSpec, intercepted, timeoutMs)
  })
})

// ── Threat Monitor ────────────────────────────────────────────────────────────

app.get('/api/threats', (_req, res) => {
  res.json({ threats: getThreats(), lastPollTime, dataSources })
})

app.get('/api/threats/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const remove = addListener((event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  })
  req.on('close', remove)
})

app.patch('/api/threats/:id/status', (req, res) => {
  const { status } = req.body
  const valid = ['active', 'blocked', 'monitoring', 'investigating', 'resolved']
  if (!valid.includes(status)) return res.status(400).json({ error: 'invalid status' })
  const threat = setThreatStatus(req.params.id, status)
  if (!threat) return res.status(404).json({ error: 'not found' })
  res.json(threat)
})

// ── Health & activity ─────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
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

app.get('/api/activity', (_req, res) => {
  res.json(activityLog)
})

// ── Phishing Payload Builder ──────────────────────────────────────────────────

// Code checkpoint / GitHub submit
app.get('/api/checkpoint/status', async (_req, res) => {
  try {
    res.json(await getCheckpointStatus())
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unable to read Git status' })
  }
})

app.post('/api/checkpoint/init', async (req, res) => {
  const { remoteUrl = '', branch = 'main', protectGenerated = true } = req.body || {}
  const steps = []

  try {
    if (!(await isGitRepo())) {
      await git(['init'])
      steps.push('Initialized Git repository')
    }

    if (branch?.trim()) {
      await git(['checkout', '-B', branch.trim()])
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

app.post('/api/checkpoint/run', async (req, res) => {
  const {
    message = '',
    push = true,
    remote = 'origin',
    branch = 'main',
    initIfNeeded = true,
    remoteUrl = '',
    protectGenerated = true,
  } = req.body || {}
  const steps = []

  try {
    if (!(await isGitRepo())) {
      if (!initIfNeeded) return res.status(400).json({ error: 'This folder is not a Git repository', steps })
      await git(['init'])
      steps.push('Initialized Git repository')
    }

    const branchResult = await git(['branch', '--show-current']).catch(() => ({ stdout: '' }))
    const targetBranch = branch?.trim() || branchResult.stdout || 'main'
    await git(['checkout', '-B', targetBranch])
    steps.push(`Using branch ${targetBranch}`)

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
    let commit = null
    if (staged) {
      const cleanMessage = message.trim() || `Checkpoint ${new Date().toLocaleString('en-US')}`
      await git(['commit', '-m', cleanMessage], { timeout: 120000 })
      const { stdout } = await git(['log', '-1', '--pretty=format:%h%x00%s'])
      const [hash, subject] = stdout.split('\x00')
      commit = { hash, subject }
      steps.push(`Created commit ${hash}`)
    } else {
      steps.push('No file changes to commit')
    }

    let pushed = false
    if (push) {
      const remotes = (await git(['remote']).catch(() => ({ stdout: '' }))).stdout.split('\n').filter(Boolean)
      if (!remotes.includes(remote)) {
        steps.push(`Skipped push: ${remote} remote is not configured`)
      } else {
        await git(['push', '-u', remote, targetBranch], { timeout: 180000 })
        pushed = true
        steps.push(`Pushed ${targetBranch} to ${remote}`)
      }
    }

    res.json({ ok: true, commit, pushed, steps, status: await getCheckpointStatus() })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Checkpoint failed', steps })
  }
})

registerPhishingRoutes(app)

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  if (process.env.NO_BANNER === '1') {
    process.stdout.write('SERVER_READY\n')
  } else {
    printBanner('api', PORT)
  }
})
