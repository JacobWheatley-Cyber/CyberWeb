import { exec } from 'child_process'
import { promisify } from 'util'
import net from 'net'
import tls from 'tls'
import dns from 'dns'
import os from 'os'

const execAsync = promisify(exec)
const IS_WIN = os.platform() === 'win32'

export const SERVICE_MAP = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
  80: 'HTTP', 88: 'Kerberos', 110: 'POP3', 111: 'RPC', 135: 'RPC',
  139: 'NetBIOS', 143: 'IMAP', 161: 'SNMP', 389: 'LDAP', 443: 'HTTPS',
  445: 'SMB', 465: 'SMTPS', 636: 'LDAPS', 993: 'IMAPS', 995: 'POP3S',
  1433: 'MSSQL', 1521: 'Oracle', 2049: 'NFS', 3000: 'HTTP-dev',
  3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 5601: 'Kibana',
  5900: 'VNC', 6379: 'Redis', 8080: 'HTTP-alt', 8443: 'HTTPS-alt',
  8888: 'HTTP-dev', 9200: 'Elasticsearch', 9300: 'Elasticsearch',
  27017: 'MongoDB', 27018: 'MongoDB',
}

export const PORT_LISTS = {
  Quick:    [22, 80, 443, 445, 3306, 3389, 8080, 8443, 21, 25, 53],
  Standard: [21, 22, 23, 25, 53, 80, 88, 110, 135, 139, 143, 389, 443, 445,
             636, 993, 995, 1433, 2049, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017],
  Thorough: [21, 22, 23, 25, 53, 80, 88, 110, 111, 135, 139, 143, 161, 389,
             443, 445, 465, 636, 993, 995, 1433, 1521, 2049, 3000, 3306, 3389,
             5432, 5601, 5900, 6379, 8080, 8443, 8888, 9200, 9300, 27017, 27018],
}

const TLS_PORTS = new Set([443, 8443, 993, 995, 636, 465])
const HTTP_PORTS = new Set([80, 8080, 8008, 8000, 3000, 4000, 5000, 8888, 9000])

// ── IP helpers ──────────────────────────────────────────────────────────────

function ipToInt(ip) {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct)) >>> 0, 0)
}
function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}
function parseCidr(cidr) {
  const [network, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr)
  if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('Invalid CIDR notation.')
  if (prefix < 22) throw new Error('Range too large — use /22 or smaller (max ~1,022 hosts).')
  const hostBits = 32 - prefix
  const networkInt = ipToInt(network) & (~((1 << hostBits) - 1) >>> 0)
  const count = (1 << hostBits) - 2
  const ips = []
  for (let i = 1; i <= count; i++) ips.push(intToIp(networkInt + i))
  return ips
}
async function resolveTarget(target) {
  if (target.includes('/')) return parseCidr(target)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) return [target]
  return new Promise((resolve, reject) => {
    dns.lookup(target, { all: true }, (err, addrs) => {
      if (err || !addrs?.length) reject(new Error(`Could not resolve: ${target}`))
      else resolve(addrs.map(a => a.address))
    })
  })
}

// ── Host discovery ───────────────────────────────────────────────────────────

async function pingHost(ip) {
  const cmd = IS_WIN ? `ping -n 1 -w 500 ${ip}` : `ping -c 1 -W 1 ${ip}`
  try {
    const { stdout } = await execAsync(cmd, { timeout: 3000 })
    const ttlMatch = stdout.match(/TTL=(\d+)/i)
    const alive = IS_WIN ? /TTL=/i.test(stdout) : !/100% packet loss/.test(stdout)
    return { alive, ttl: ttlMatch ? parseInt(ttlMatch[1]) : null }
  } catch {
    return { alive: false, ttl: null }
  }
}

export function guessOs(ttl) {
  if (!ttl) return 'Unknown'
  if (ttl <= 64) return 'Linux / macOS'
  if (ttl <= 128) return 'Windows'
  return 'Network Device'
}

// ── Port scanning ────────────────────────────────────────────────────────────

function scanPortStatus(ip, port, timeout = 1000) {
  return new Promise(resolve => {
    const socket = new net.Socket()
    let done = false
    const finish = (s) => { if (!done) { done = true; socket.destroy(); resolve(s) } }
    socket.setTimeout(timeout)
    socket.on('connect', () => finish('open'))
    socket.on('error', err => finish(err.code === 'ECONNREFUSED' ? 'closed' : 'filtered'))
    socket.on('timeout', () => finish('filtered'))
    socket.connect(port, ip)
  })
}

function grabBanner(ip, port, timeout = 1800) {
  return new Promise(resolve => {
    let data = ''
    let done = false
    let socket

    const finish = () => {
      if (!done) { done = true; try { socket?.destroy() } catch {} resolve(data.trim().slice(0, 300)) }
    }

    try {
      if (TLS_PORTS.has(port)) {
        socket = tls.connect({ host: ip, port, rejectUnauthorized: false })
        socket.setTimeout(timeout)
        socket.on('secureConnect', () => {
          socket.write(`HEAD / HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`)
        })
      } else {
        socket = new net.Socket()
        socket.setTimeout(timeout)
        socket.connect(port, ip, () => {
          if (HTTP_PORTS.has(port)) {
            socket.write(`HEAD / HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`)
          }
          // SSH, FTP, SMTP etc send banner immediately — just wait
        })
      }
      socket.on('data', d => { data += d.toString('utf8', 0, 300); finish() })
      socket.on('error', () => finish())
      socket.on('timeout', () => finish())
    } catch {
      finish()
    }
  })
}

async function scanPorts(ip, mode) {
  const ports = PORT_LISTS[mode] ?? PORT_LISTS.Standard

  // Scan all ports for status in parallel
  const statuses = await Promise.all(
    ports.map(port => scanPortStatus(ip, port).then(status => ({ port, status })))
  )

  const openPorts = statuses.filter(p => p.status === 'open').map(p => p.port)

  // Grab banners for open ports in parallel
  const bannerResults = await Promise.all(
    openPorts.map(port => grabBanner(ip, port).then(banner => ({ port, banner })))
  )

  const banners = {}
  bannerResults.forEach(({ port, banner }) => { if (banner) banners[port] = banner })

  // Build full port result list
  const allPorts = statuses.map(({ port, status }) => ({
    port,
    status,
    service: SERVICE_MAP[port] ?? '',
    banner: banners[port] ?? '',
  }))

  return { openPorts, allPorts, banners }
}

async function getHostname(ip) {
  return new Promise(resolve => {
    dns.reverse(ip, (err, names) => resolve(err || !names?.length ? '' : names[0]))
  })
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runPool(items, fn, concurrency, onResult) {
  const queue = [...items]
  let processed = 0
  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) break
      const result = await fn(item)
      onResult(result, ++processed)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function scanTarget(target, mode, send) {
  const ips = await resolveTarget(target.trim())
  send('start', { total: ips.length, target })

  const scanMode = PORT_LISTS[mode] ? mode : 'Standard'

  await runPool(ips, async (ip) => {
    const { alive, ttl } = await pingHost(ip)

    if (!alive) {
      return { ip, hostname: '', ports: [], services: [], os: 'Unknown', status: 'down', banners: {}, allPorts: [] }
    }

    const [{ openPorts, allPorts, banners }, hostname] = await Promise.all([
      scanPorts(ip, scanMode),
      getHostname(ip),
    ])

    return {
      ip,
      hostname,
      ports: openPorts,
      services: openPorts.map(p => SERVICE_MAP[p] ?? `${p}/tcp`),
      os: guessOs(ttl),
      status: 'up',
      banners,
      allPorts,
    }
  }, 20, (result, processed) => {
    if (result.status === 'up') send('host', result)
    send('progress', { scanned: processed, total: ips.length })
  })

  send('complete', { total: ips.length })
}
