import { exec } from 'child_process'
import { promisify } from 'util'
import https from 'https'
import http from 'http'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadLocalJson, saveLocalJson } from './localStore.js'

const execAsync = promisify(exec)

// ── Feodo Tracker C2 blocklist ────────────────────────────────────────────────
// Free, no API key. Updated several times daily by abuse.ch.

const c2Map = new Map() // ip → { family }
let blocklistAge = 0
let blocklistOk = false

function httpsGetJson(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: 12000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects <= 0) return reject(new Error('too many redirects'))
        res.resume()
        return resolve(httpsGetJson(res.headers.location, redirects - 1))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { reject(new Error('JSON parse failed')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function refreshBlocklist() {
  if (Date.now() - blocklistAge < 3_600_000) return
  try {
    const list = await httpsGetJson('https://feodotracker.abuse.ch/downloads/ipblocklist.json')
    c2Map.clear()
    for (const e of list) {
      if (e.ip_address) c2Map.set(e.ip_address, { family: e.malware || 'Botnet' })
    }
    blocklistAge = Date.now()
    blocklistOk = true
    console.log(`\x1b[36m[threats]\x1b[0m Feodo Tracker: ${c2Map.size} C2 IPs loaded`)
  } catch (err) {
    console.warn(`\x1b[33m[threats]\x1b[0m Blocklist fetch failed: ${err.message}`)
  }
}


function isPrivate(ip) {
  if (!ip) return true
  const s = String(ip)
  return s === '0.0.0.0' || s === '127.0.0.1' || s === '::1' ||
    /^(10|127)\./.test(s) || /^192\.168\./.test(s) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(s) ||
    s.startsWith('fe80') || s.startsWith('::') || s === '-'
}

function getGeo() { return null }
function getReputation() { return null }

// ── Source 1: netstat → check against Feodo Tracker ──────────────────────────

function parseIp(addr) {
  if (!addr) return null
  if (addr.startsWith('[')) {
    const m = addr.match(/^\[([^\]]+)\]/)
    return m ? m[1] : null
  }
  const idx = addr.lastIndexOf(':')
  return idx > 0 ? addr.slice(0, idx) : null
}

async function scanNetworkConnections() {
  try {
    const { stdout } = await execAsync('netstat -nao', { shell: 'cmd.exe', timeout: 8000 })
    const threats = []
    const seen = new Set()

    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 5) continue
      const [proto, local, foreign, state] = parts
      if (state !== 'ESTABLISHED') continue

      const ip = parseIp(foreign)
      if (!ip || isPrivate(ip) || seen.has(ip)) continue
      seen.add(ip)

      const hit = c2Map.get(ip)
      if (!hit) continue

      const localPort = local.split(':').pop() ?? local.split(']:')?.[1] ?? '?'
      console.log(`\x1b[31m[threats]\x1b[0m C2 connection detected: ${ip} (${hit.family})`)
      threats.push({
        id: `net-${ip}`,
        type: `${hit.family} C2 Beacon`,
        severity: 'critical',
        source: ip,
        target: `this machine :${localPort}`,
        protocol: proto.replace(/\d$/, '').toUpperCase(),
        mitre: ['T1071.001', 'T1105', 'T1573'],
        geo: getGeo(ip),
        reputation: getReputation(ip, true),
        status: 'active',
        timestamp: new Date().toISOString(),
        source_label: 'Feodo Tracker + netstat',
      })
    }
    return threats
  } catch (err) {
    console.warn(`\x1b[33m[threats]\x1b[0m netstat failed: ${err.message}`)
    return null
  }
}

// ── Source 2: Windows Security Event Log (failed logins) ─────────────────────

async function scanEventLog() {
  const script = `
$since = (Get-Date).AddHours(-24)
$events = Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625;StartTime=$since} -MaxEvents 500 -ErrorAction SilentlyContinue
if (-not $events) { Write-Output '[]'; exit }
$groups = $events | Group-Object { $_.Properties[19].Value }
$out = $groups | ForEach-Object {
  [pscustomobject]@{
    ip      = $_.Name
    count   = $_.Count
    last    = ($_.Group | Select-Object -First 1).TimeCreated.ToString('o')
    account = ($_.Group[0].Properties[5].Value)
  }
}
$out | ConvertTo-Json -Compress
`
  const tmpFile = join(tmpdir(), `cw-evtlog-${process.pid}.ps1`)
  try {
    writeFileSync(tmpFile, script, 'utf8')
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { shell: 'cmd.exe', timeout: 20000 }
    )
    const text = stdout.trim()
    if (!text || text === '[]' || text === 'null') return []

    const raw = JSON.parse(text)
    const rows = Array.isArray(raw) ? raw : [raw]

    return rows
      .filter(r => r.ip && !['', '-', '::', '::1', '0.0.0.0'].includes(r.ip))
      .map(r => {
        const count = Number(r.count) || 1
        const sev = count >= 100 ? 'critical' : count >= 20 ? 'high' : count >= 5 ? 'medium' : 'low'
        const type = count >= 20 ? 'Brute Force Attack' : `Failed Login ×${count}`
        return {
          id: `evtlog-${String(r.ip).replace(/[.:]/g, '-')}`,
          type,
          severity: sev,
          source: r.ip,
          target: 'this machine (auth)',
          protocol: 'TCP',
          mitre: count >= 20 ? ['T1110.001', 'T1078'] : ['T1110.001'],
          geo: getGeo(r.ip),
          reputation: getReputation(r.ip),
          status: 'active',
          timestamp: r.last,
          notes: `${count} attempt${count !== 1 ? 's' : ''} in last 24h · account: ${r.account || '?'}`,
          source_label: 'Windows Security Event Log',
        }
      })
  } catch (err) {
    const msg = err.message || ''
    if (!msg.includes('Access is denied') && !msg.includes('TerminatingError') && !msg.includes('UnauthorizedAccess')) {
      console.warn(`\x1b[33m[threats]\x1b[0m Event log: ${msg.split('\n')[0].slice(0, 120)}`)
    } else {
      console.warn(`\x1b[33m[threats]\x1b[0m Event log: access denied (run server as Administrator to enable)`)
    }
    return null
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

// ── Threat store & polling ────────────────────────────────────────────────────

const THREAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_THREATS = 1000
const restored = loadLocalJson('threats.json', [])
const store = new Map((Array.isArray(restored) ? restored : [])
  .filter(t => t && typeof t.id === 'string' && Number.isFinite(Date.parse(t.timestamp)) &&
    Date.now() - Date.parse(t.timestamp) < THREAT_RETENTION_MS)
  .slice(-MAX_THREATS).map(t => [t.id, t]))
const listeners = new Set()

function persistThreats() {
  try { saveLocalJson('threats.json', [...store.values()]) }
  catch (err) { console.warn(`[threats] Could not save local history: ${err.message}`) }
}

function broadcast(event, data) {
  for (const fn of listeners) fn(event, data)
}

export let lastPollTime = null
export let dataSources = { blocklist: false, netstat: false, eventLog: false, blocklistSize: 0 }
let polling = false
let started = false

async function poll() {
  if (polling) return
  polling = true
  try {
  await refreshBlocklist()

  const [netThreats, evtThreats] = await Promise.all([
    scanNetworkConnections(),
    scanEventLog(),
  ])

  dataSources = {
    blocklist: blocklistOk,
    blocklistSize: c2Map.size,
    netstat: netThreats !== null,
    eventLog: evtThreats !== null,
  }

  for (const t of [...(netThreats ?? []), ...(evtThreats ?? [])]) {
    const existing = store.get(t.id)
    if (!existing) {
      store.set(t.id, t)
      broadcast('threat', t)
    } else if (existing.timestamp !== t.timestamp) {
      // Update existing (e.g. count went up)
      store.set(t.id, { ...existing, ...t })
      broadcast('threat_update', store.get(t.id))
    }
  }

  for (const [id, threat] of store) {
    if (Date.now() - Date.parse(threat.timestamp) >= THREAT_RETENTION_MS) store.delete(id)
  }
  while (store.size > MAX_THREATS) store.delete(store.keys().next().value)
  persistThreats()

  lastPollTime = new Date().toISOString()
  console.log(`\x1b[36m[threats]\x1b[0m Poll complete — ${store.size} active threat(s)`)
  } finally {
    polling = false
  }
}

export function startThreatMonitor() {
  if (started) return
  started = true
  void poll().catch(err => console.warn(`[threats] Poll failed: ${err.message}`))
  setInterval(() => void poll().catch(err => console.warn(`[threats] Poll failed: ${err.message}`)), 30_000)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getThreats() {
  return [...store.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

export function setThreatStatus(id, status) {
  const t = store.get(id)
  if (!t) return null
  t.status = status
  persistThreats()
  return t
}

export function addListener(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
