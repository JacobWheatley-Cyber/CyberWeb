import dns from 'dns/promises'
import net from 'net'

function ipv4Number(ip) {
  if (net.isIP(ip) !== 4) throw new Error(`Invalid IPv4 address: ${ip}`)
  return ip.split('.').reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0)
}

function cidrParts(cidr) {
  const [address, prefixText, extra] = cidr.split('/')
  const prefix = Number(prefixText)
  if (extra !== undefined || !/^(0|[1-9]\d{0,1})$/.test(prefixText || '') || prefix > 32)
    throw new Error(`Invalid IPv4 CIDR: ${cidr}`)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return { network: ipv4Number(address) & mask, prefix, mask }
}

export async function resolveSingleTarget(target) {
  const value = String(target || '').trim()
  if (net.isIP(value) === 4) return value
  if (/^[\d.]+$/.test(value)) throw new Error('Enter a valid IPv4 address or hostname.')
  if (net.isIP(value) || !/^(?=.{1,253}$)[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(value))
    throw new Error('Enter a valid IPv4 address or hostname.')
  const addresses = (await dns.lookup(value, { all: true, family: 4 })).map(entry => entry.address)
  if (!addresses.length) throw new Error(`Could not resolve ${value}`)
  // Return the resolved address so downstream sockets never re-resolve the name.
  return addresses[0]
}

export async function resolveScanTargets(target) {
  const value = String(target || '').trim()
  if (!value.includes('/')) return [await resolveSingleTarget(value)]
  const { network, prefix } = cidrParts(value)
  if (prefix < 22) throw new Error('CIDR range is too large; maximum is /22 (1,022 hosts).')
  const total = 2 ** (32 - prefix)
  const first = prefix >= 31 ? 0 : 1
  const last = prefix >= 31 ? total : total - 1
  const targets = []
  for (let i = first; i < last; i++) {
    const n = (network + i) >>> 0
    const ip = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
    targets.push(ip)
  }
  return targets
}
