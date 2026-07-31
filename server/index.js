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
import { SHERLOCK_SITES } from './sherlockSites.js'
import { analyzeNetworks } from './wirelessAnalyzer.js'

const app = express()
const PORT = 3001
const execFileAsync = promisify(execFile)
const REPO_ROOT = process.cwd()

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json())

// ── API key auth ──────────────────────────────────────────────────────────────

const API_KEY = process.env.CYBERWEB_API_KEY || ''

if (!API_KEY) {
  console.warn('[auth] CYBERWEB_API_KEY is not set — all endpoints are unprotected. Set it in .env to enable authentication.')
}

function requireApiKey(req, res, next) {
  if (!API_KEY) return next()
  const provided = req.headers['x-api-key'] || req.query.api_key
  if (provided !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

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

app.get('/api/scan', requireApiKey, (req, res) => {
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

app.get('/api/vuln-scan', requireApiKey, (req, res) => {
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

app.get('/api/port-scan', requireApiKey, (req, res) => {
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

app.post('/api/checkpoint/run', requireApiKey, async (req, res) => {
  const {
    message = '',
    push = true,
    remote = 'origin',
    branch = 'main',
    initIfNeeded = true,
    remoteUrl = '',
    protectGenerated = true,
    pushStrategy = 'normal', // 'normal' | 'rebase' | 'force'
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

// Patterns that indicate "not found" even when HTTP status is 200.
// Checked case-insensitively against first 10KB of body for all sites.
const STALE_PATTERNS = [
  "sorry, this page isn't available",           // Instagram
  "this account doesn't exist",                 // Twitter/X variants
  "page not found",
  "user not found",
  "profile not found",
  "account not found",
  "couldn't find this account",
  "we couldn't find that user",
  "this channel doesn't exist",
  "the page you requested was not found",
  "sorry, that page doesn't exist",
  "this page doesn't exist",
  "oops! that page can't be found",
  "sorry, we can't find the page",
  "hmm...this page doesn't exist",
  "the link you followed may be broken",        // Instagram error body
  "no such user",
  "no users found",
  "404 not found",
  "<title>error</title>",
  "<title>not found</title>",
  "<title>page not found</title>",
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
      const body = await readPartialBody(res)

      // Some APIs (Hacker News) return literal "null" for missing users
      if (site.apiUrl && body.trim() === 'null') {
        return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
      }

      // API check passed — user data was returned
      if (site.apiUrl) {
        return { ...site, url: displayUrl, found: true, responseTime, httpStatus: res.status }
      }

      // HTML check: site-specific error message
      if (site.errorType === 'message' && site.errorMsg) {
        if (body.toLowerCase().includes(site.errorMsg.toLowerCase())) {
          return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
        }
      }

      // Generic stale page detection
      if (isStale(body)) {
        return { ...site, url: displayUrl, found: false, responseTime, httpStatus: res.status }
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

  sseHandler(res, async (send) => {
    send('start', { total: SHERLOCK_SITES.length, username })

    for (let i = 0; i < SHERLOCK_SITES.length; i += SHERLOCK_BATCH) {
      const batch = SHERLOCK_SITES.slice(i, i + SHERLOCK_BATCH)
      const results = await Promise.all(batch.map(site => checkSite(site, username)))
      for (const result of results) {
        send('result', result)
      }
    }

    send('complete', { username, total: SHERLOCK_SITES.length })
  })
})

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  if (process.env.NO_BANNER === '1') {
    process.stdout.write('SERVER_READY\n')
  } else {
    printBanner('api', PORT)
  }
})
