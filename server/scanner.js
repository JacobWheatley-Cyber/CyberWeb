import { execFile } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import { resolveScanTargets } from './targetPolicy.js'
import { tcpConnect, serviceProbe, identifyService } from './networkProbes.js'
import { reverseLookup } from './reverseLookup.js'

const execFileAsync = promisify(execFile)
const IS_WIN = os.platform() === 'win32'

export const SERVICE_MAP = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
  110: 'POP3', 143: 'IMAP', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB',
  465: 'SMTPS', 636: 'LDAPS', 993: 'IMAPS', 995: 'POP3S',
  1433: 'MSSQL', 2049: 'NFS', 3000: 'HTTP', 3306: 'MySQL',
  3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis',
  8080: 'HTTP', 8443: 'HTTPS', 8888: 'HTTP', 9200: 'Elasticsearch',
  27017: 'MongoDB',
}

export const PORT_LISTS = {
  Quick: [22, 80, 443, 445, 3306, 3389, 8080, 8443, 21, 25, 53],
  Standard: [21, 22, 23, 25, 53, 80, 110, 143, 389, 443, 445,
    465, 636, 993, 995, 1433, 2049, 3000, 3306, 3389, 5432,
    5900, 6379, 8080, 8443, 8888, 27017],
  Thorough: [21, 22, 23, 25, 53, 80, 88, 110, 111, 135, 139, 143,
    161, 389, 443, 445, 465, 636, 993, 995, 1433, 1521, 2049,
    3000, 3306, 3389, 5432, 5601, 5900, 5985, 5986, 6379,
    8080, 8443, 8888, 9200, 9300, 27017, 27018],
}

async function pingHost(ip, signal) {
  const args = IS_WIN ? ['-n', '1', '-w', '700', ip] : ['-c', '1', '-W', '1', ip]
  try {
    const { stdout } = await execFileAsync('ping', args, { timeout: 3000, signal })
    const match = stdout.match(/TTL=(\d+)/i)
    return { alive: true, ttl: match ? Number(match[1]) : null }
  } catch { return { alive: false, ttl: null } }
}

async function mapHost(ip, mode, signal) {
  const ports = PORT_LISTS[mode]
  const ping = await pingHost(ip, signal)
  if (signal?.aborted) return null
  const discoveryPorts = ping.alive ? [] : [22, 80, 443, 445, 3389, 8080, 8443]
  const discovery = await Promise.all(discoveryPorts.map(port => tcpConnect(ip, port, 750, signal)))
  if (signal?.aborted) return null
  const tcpResponded = discovery.some(result => result.status === 'open' || result.status === 'closed')
  const alive = ping.alive || tcpResponded
  if (!alive) return {
    ip, hostname: '', ports: [], services: [], os: 'Not identified',
    status: 'down', discovery: 'no response', ttl: ping.ttl, banners: {}, allPorts: [],
  }

  const results = new Array(ports.length)
  let nextPort = 0
  const [_, hostname] = await Promise.all([
    Promise.all(Array.from({ length: Math.min(12, ports.length) }, async () => {
      while (nextPort < ports.length && !signal?.aborted) {
        const index = nextPort++
        const port = ports[index]
        const connection = await tcpConnect(ip, port, 1000, signal)
        if (connection.status !== 'open' || signal?.aborted) {
          results[index] = { port, status: connection.status, service: SERVICE_MAP[port] || 'unknown', banner: '', latencyMs: connection.latencyMs, tls: null }
          continue
        }
        const evidence = await serviceProbe(ip, port, 1800, signal)
        const identified = identifyService(port, evidence.banner, evidence.tls, SERVICE_MAP[port] || 'unknown')
        results[index] = { port, status: 'open', service: identified.name, serviceSource: identified.source, latencyMs: connection.latencyMs, ...evidence }
      }
    })),
    reverseLookup(ip),
  ])
  if (signal?.aborted) return null
  const open = results.filter(result => result.status === 'open')
  return {
    ip, hostname, ports: open.map(result => result.port),
    services: open.map(result => result.service),
    os: 'Not identified', status: 'up',
    discovery: ping.alive ? 'ICMP echo' : 'TCP response', ttl: ping.ttl,
    banners: Object.fromEntries(open.filter(result => result.banner).map(result => [result.port, result.banner])),
    allPorts: results,
  }
}

export async function scanTarget(target, mode, send, signal) {
  const ips = await resolveScanTargets(target.trim())
  if (signal?.aborted) return
  const scanMode = PORT_LISTS[mode] ? mode : 'Standard'
  send('start', { total: ips.length, target, mode: scanMode })
  let cursor = 0
  let processed = 0
  let responsive = 0
  await Promise.all(Array.from({ length: Math.min(10, ips.length) }, async () => {
    while (cursor < ips.length && !signal?.aborted) {
      const ip = ips[cursor++]
      const host = await mapHost(ip, scanMode, signal)
      if (signal?.aborted || !host) return
      if (host.status === 'up') responsive++
      send('host', host)
      send('progress', { scanned: ++processed, total: ips.length })
    }
  }))
  if (!signal?.aborted) send('complete', { total: ips.length, responsive })
}
