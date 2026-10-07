import net from 'net'
import { scanTarget } from './scanner.js'
import { inspectHttp } from './networkProbes.js'

const WEB_PORTS = new Set([80, 443, 3000, 8080, 8443, 8888])
const ENCRYPTED_WEB = new Set([443, 8443])

function finding(host, port, rule, severity, title, description, evidence, remediation) {
  return {
    ip: host.ip, hostname: host.hostname, port, service: rule,
    severity, title, description, evidence, remediation,
    verified: true, cve: null,
  }
}

export function analyzeHttp(host, port, response, encrypted) {
  if (response.error || !response.statusCode) return []
  if (response.statusCode < 200 || response.statusCode >= 400) return []
  const headers = response.headers
  const seen = `HEAD / returned HTTP ${response.statusCode} on ${host.ip}:${port}`
  const results = []
  if (!encrypted && !(response.statusCode >= 300 && response.statusCode < 400 &&
      /^https:\/\//i.test(String(headers.location || '')))) {
    results.push(finding(host, port, 'HTTP', 'medium', 'HTTP served without an HTTPS redirect',
      'The root page responded over plaintext HTTP and did not redirect this request to HTTPS.',
      seen, 'Configure HTTPS and redirect HTTP requests to it. Review other paths separately.'))
  }
  if (encrypted && !headers['strict-transport-security']) {
    results.push(finding(host, port, 'HTTPS', 'low', 'HSTS header absent',
      'The HTTPS root response did not include Strict-Transport-Security.',
      `${seen}; Strict-Transport-Security absent`, 'Add HSTS after confirming the site and subdomains support HTTPS.'))
  }
  if (!headers['x-content-type-options']) {
    results.push(finding(host, port, encrypted ? 'HTTPS' : 'HTTP', 'low', 'X-Content-Type-Options header absent',
      'The root response did not include X-Content-Type-Options: nosniff.',
      `${seen}; X-Content-Type-Options absent`, 'Add X-Content-Type-Options: nosniff to browser-facing responses.'))
  }
  return results
}

export function analyzeTls(host, port, info) {
  if (!info?.validTo) return []
  const expiration = Date.parse(info.validTo)
  if (!Number.isFinite(expiration)) return []
  const days = Math.floor((expiration - Date.now()) / 86400000)
  if (days > 30) return []
  return [finding(host, port, 'TLS', days < 0 ? 'high' : 'medium',
    days < 0 ? 'TLS certificate expired' : 'TLS certificate expires soon',
    days < 0 ? 'The server presented an expired certificate.' : 'The server certificate expires within 30 days.',
    `TLS ${info.protocol || 'unknown'}; certificate expires ${info.validTo}`,
    'Renew the certificate and verify the deployed certificate chain.')]
}

function redisPing(ip, signal) {
  return new Promise(resolve => {
    const socket = new net.Socket()
    let settled = false
    const finish = answer => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      socket.destroy()
      resolve(answer)
    }
    const abort = () => finish('')
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    socket.setTimeout(1800)
    socket.once('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'))
    socket.once('data', data => finish(data.toString('utf8', 0, 64)))
    socket.once('error', () => finish(''))
    socket.once('timeout', () => finish(''))
    socket.connect(6379, ip)
  })
}

async function analyzeHost(host, signal) {
  const results = []
  const open = host.allPorts.filter(port => port.status === 'open')
  for (const port of open) {
    if (signal?.aborted) break
    results.push(...analyzeTls(host, port.port, port.tls))
    if (WEB_PORTS.has(port.port)) {
      const response = await inspectHttp(host.ip, port.port, ENCRYPTED_WEB.has(port.port), 2500, signal)
      results.push(...analyzeHttp(host, port.port, response, ENCRYPTED_WEB.has(port.port)))
    }
    if (port.port === 6379) {
      const answer = await redisPing(host.ip, signal)
      if (answer.startsWith('+PONG')) results.push(finding(host, 6379, 'Redis', 'high',
        'Redis accepts unauthenticated PING',
        'A remote client received PONG without authenticating. This confirms unauthenticated command access for PING, not data access.',
        'Redis PING returned +PONG without AUTH',
        'Restrict Redis to trusted clients and require authentication; separately verify data permissions.'))
    }
  }
  return results
}

export async function vulnScanTarget(target, mode, send, signal) {
  const hosts = []
  await scanTarget(target, mode, (event, data) => {
    if (event === 'start') send('start', data)
    if (event === 'progress') send('progress', data)
    if (event === 'host' && data.status === 'up') {
      hosts.push(data)
      send('host_found', { ip: data.ip, hostname: data.hostname, portCount: data.ports.length, ports: data.ports })
    }
  }, signal)
  if (signal?.aborted) return
  send('phase', { phase: 'analysis', hostCount: hosts.length })
  let count = 0
  for (const [index, host] of hosts.entries()) {
    if (signal?.aborted) return
    const findings = await analyzeHost(host, signal)
    for (const result of findings) send('finding', { ...result, id: ++count })
    send('host_analyzed', { ip: host.ip, index: index + 1, total: hosts.length, findingCount: findings.length })
  }
  if (!signal?.aborted) send('complete', { hostsScanned: hosts.length, findingsTotal: count })
}
