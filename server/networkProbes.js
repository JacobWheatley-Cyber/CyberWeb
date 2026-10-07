import net from 'net'
import tls from 'tls'
import http from 'http'
import https from 'https'

export const HTTP_PORTS = new Set([80, 3000, 5000, 8000, 8008, 8080, 8888, 9000, 9090])
export const TLS_PORTS = new Set([443, 465, 636, 990, 993, 995, 8443, 5986])
const PASSIVE_PORTS = new Set([21, 22, 23, 25, 110, 143, 3306, 5432, 6379, 27017])

export function identifyService(port, banner, tls, hint = 'unknown') {
  if (/^SSH-/i.test(banner)) return { name: 'SSH', source: 'banner' }
  if (/^HTTP\/\d/i.test(banner)) return { name: tls ? 'HTTPS' : 'HTTP', source: 'response' }
  if (/^220[ -].*ftp/i.test(banner)) return { name: 'FTP', source: 'banner' }
  if (/^220[ -].*smtp/i.test(banner)) return { name: 'SMTP', source: 'banner' }
  return { name: hint, source: 'port hint' }
}

export function tcpConnect(ip, port, timeoutMs = 1000, signal) {
  return new Promise(resolve => {
    const socket = new net.Socket()
    const started = Date.now()
    let settled = false
    const finish = status => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      socket.destroy()
      resolve({ status, latencyMs: status === 'open' ? Date.now() - started : null })
    }
    const abort = () => finish('cancelled')
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish('open'))
    socket.once('error', error => finish(error.code === 'ECONNREFUSED' ? 'closed' : 'filtered'))
    socket.once('timeout', () => finish('filtered'))
    socket.connect(port, ip)
  })
}

export function serviceProbe(ip, port, timeoutMs = 1800, signal, host = ip) {
  return new Promise(resolve => {
    let socket
    let settled = false
    let banner = ''
    let tlsInfo = null
    let fallbackTimer
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(fallbackTimer)
      signal?.removeEventListener('abort', abort)
      socket?.destroy()
      resolve({ banner: banner.trim().slice(0, 512), tls: tlsInfo })
    }
    const abort = () => finish()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    try {
      const encrypted = TLS_PORTS.has(port)
      socket = encrypted
        ? tls.connect({ host: ip, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: false })
        : new net.Socket()
      socket.setTimeout(timeoutMs)
      socket.on('data', chunk => {
        banner += chunk.toString('utf8', 0, Math.min(chunk.length, 512))
        finish()
      })
      socket.once('error', finish)
      socket.once('timeout', finish)
      if (encrypted) {
        socket.once('secureConnect', () => {
          const cert = socket.getPeerCertificate()
          tlsInfo = {
            protocol: socket.getProtocol(),
            authorized: socket.authorized,
            authorizationError: socket.authorizationError || null,
            validTo: cert.valid_to || null,
            subject: cert.subject?.CN || null,
          }
          if (port === 443 || port === 8443) socket.write(`HEAD / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`)
          else finish()
        })
      } else {
        socket.connect(port, ip, () => {
          if (HTTP_PORTS.has(port)) socket.write(`HEAD / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`)
          else if (!PASSIVE_PORTS.has(port)) fallbackTimer = setTimeout(() => {
            if (!settled && !banner) socket.write(`HEAD / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`)
          }, 200)
        })
      }
    } catch { finish() }
  })
}

// HEAD only, no redirect following, no response body retained. The socket connects to
// the already validated IP so DNS cannot change the target after scope validation.
export function inspectHttp(ip, port, encrypted, timeoutMs = 2500, signal, host = ip) {
  return new Promise(resolve => {
    const transport = encrypted ? https : http
    const request = transport.request({
      hostname: ip, port, path: '/', method: 'HEAD',
      headers: { Host: host, 'User-Agent': 'CyberWeb-Authorized-Assessment/1.0' },
      servername: net.isIP(host) ? undefined : host,
      rejectUnauthorized: false,
      agent: false,
      timeout: timeoutMs,
      signal,
    }, response => {
      response.resume()
      resolve({ statusCode: response.statusCode, headers: response.headers, error: null })
      request.destroy()
    })
    request.once('timeout', () => request.destroy(new Error('Timed out')))
    request.once('error', error => resolve({ statusCode: null, headers: {}, error: error.message }))
    request.end()
  })
}
