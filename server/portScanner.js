import { SERVICE_MAP } from './scanner.js'
import { resolveSingleTarget } from './targetPolicy.js'
import { tcpConnect, serviceProbe, identifyService } from './networkProbes.js'
import { reverseLookup } from './reverseLookup.js'

export const PORT_PRESETS = {
  Quick: [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 3306, 3389, 5900, 8080, 8443, 27017, 6379, 9200],
  Standard: [21, 22, 23, 25, 26, 53, 80, 81, 88, 110, 111, 113, 135, 139, 143, 389,
    443, 444, 445, 465, 512, 513, 514, 548, 554, 587, 636, 873, 902,
    990, 993, 995, 1080, 1433, 1521, 2049, 2121, 2375, 3000, 3268,
    3306, 3389, 5432, 5601, 5900, 5985, 5986, 6000, 6379, 7070,
    8000, 8008, 8009, 8080, 8443, 8888, 9200, 9300, 10000, 11211,
    27017, 27018, 49152, 49153],
  Thorough: [7, 9, 13, 21, 22, 23, 25, 26, 37, 53, 79, 80, 81, 88, 106, 110,
    111, 113, 119, 135, 139, 143, 144, 179, 199, 389, 427, 443, 444,
    445, 465, 513, 514, 543, 544, 548, 554, 587, 593, 625, 631, 636,
    646, 787, 808, 873, 902, 990, 993, 995, 1025, 1026, 1027, 1028,
    1029, 1080, 1110, 1433, 1521, 1720, 1723, 1755, 1900, 2000, 2001,
    2049, 2121, 2375, 2376, 2717, 3000, 3128, 3268, 3306, 3389,
    3986, 4899, 5000, 5009, 5060, 5432, 5601, 5631, 5666, 5800,
    5900, 5985, 5986, 6000, 6001, 6379, 6646, 7070, 7937, 7938,
    8000, 8008, 8009, 8080, 8443, 8888, 9100, 9200, 9300, 9999,
    10000, 11211, 27017, 27018, 32768, 49152, 49153, 49154, 49155, 49156, 49157],
}

export function parsePortSpec(spec) {
  const value = String(spec || '').trim()
  if (!value || value.length > 100000) throw new Error('Enter a port or range (up to 10,000 unique ports).')
  const ports = new Set()
  for (const token of value.split(',')) {
    const item = token.trim()
    if (/^\d+$/.test(item)) {
      const port = Number(item)
      if (port < 1 || port > 65535) throw new Error(`Invalid port: ${item}`)
      ports.add(port)
    } else if (/^\d+-\d+$/.test(item)) {
      const [first, last] = item.split('-').map(Number)
      if (first < 1 || last > 65535 || first > last || last - first >= 10000)
        throw new Error(`Invalid range or excessive port span: ${item}`)
      for (let port = first; port <= last; port++) ports.add(port)
    } else throw new Error(`Invalid port specification: ${item}`)
    if (ports.size > 10000) throw new Error('Maximum 10,000 unique ports per scan.')
  }
  return [...ports].sort((a, b) => a - b)
}

function reviewPriority(port) {
  if ([23, 2375, 6379].includes(port)) return 'high'
  if ([21, 445, 1433, 3306, 3389, 5432, 5900, 9200, 27017].includes(port)) return 'medium'
  return 'low'
}

export async function portScan(target, portSpec, send, timeoutMs = 1000, signal) {
  const ports = parsePortSpec(portSpec)
  const ip = await resolveSingleTarget(target)
  if (signal?.aborted) return
  let hostname = target === ip ? '' : target
  if (!hostname) hostname = await reverseLookup(ip)
  send('start', { target, ip, hostname, totalPorts: ports.length, method: 'TCP connect' })
  let cursor = 0
  let open = 0, closed = 0, filtered = 0
  await Promise.all(Array.from({ length: Math.min(48, ports.length) }, async () => {
    while (cursor < ports.length && !signal?.aborted) {
      const port = ports[cursor++]
      const probe = await tcpConnect(ip, port, timeoutMs, signal)
      if (signal?.aborted) return
      const evidence = probe.status === 'open'
        ? await serviceProbe(ip, port, Math.min(timeoutMs + 1000, 3000), signal, target !== ip ? target : ip)
        : { banner: '', tls: null }
      if (signal?.aborted) return
      if (probe.status === 'open') open++
      else if (probe.status === 'closed') closed++
      else filtered++
      const identified = identifyService(port, evidence.banner, evidence.tls, SERVICE_MAP[port] || 'unknown')
      send('port', {
        port, status: probe.status, service: identified.name,
        serviceSource: identified.source, banner: evidence.banner,
        latencyMs: probe.latencyMs, tls: evidence.tls,
        risk: probe.status === 'open' ? reviewPriority(port) : 'none',
        mitre: [], recommendations: probe.status === 'open'
          ? ['Confirm the service and intended network exposure with its owner.'] : [],
      })
    }
  }))
  if (!signal?.aborted) send('complete', { open, closed, filtered, total: ports.length })
}
