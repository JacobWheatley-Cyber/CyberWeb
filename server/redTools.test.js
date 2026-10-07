import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { tcpConnect, inspectHttp } from './networkProbes.js'
import { portScan, parsePortSpec } from './portScanner.js'
import { analyzeHttp, analyzeTls } from './vulnScanner.js'

test('TCP scan reports an observed local HTTP service and a closed port', async () => {
  const server = http.createServer((_req, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  try {
    const connected = await tcpConnect('127.0.0.1', port)
    assert.equal(connected.status, 'open')
    const response = await inspectHttp('127.0.0.1', port, false)
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    const events = []
    await portScan('127.0.0.1', String(port), (name, data) => events.push({ name, data }))
    const result = events.find(event => event.name === 'port').data
    assert.equal(result.status, 'open')
    assert.match(result.banner, /^HTTP\/1/)
    assert.equal(result.service, 'HTTP')
    assert.equal(result.serviceSource, 'response')
    assert.equal(events.at(-1).data.open, 1)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  assert.equal((await tcpConnect('127.0.0.1', port)).status, 'closed')
})

test('evidence rules do not infer a CVE from a port', () => {
  const host = { ip: '127.0.0.1', hostname: '' }
  const plain = analyzeHttp(host, 80, { statusCode: 200, headers: {}, error: null }, false)
  assert(plain.some(item => item.title.includes('HTTPS redirect')))
  assert(plain.every(item => item.verified && item.cve === null && item.evidence))
  const redirect = analyzeHttp(host, 80, {
    statusCode: 301,
    headers: { location: 'https://example.test/', 'x-content-type-options': 'nosniff' },
    error: null,
  }, false)
  assert.equal(redirect.length, 0)
  assert.equal(analyzeHttp(host, 80, { statusCode: null, headers: {}, error: 'timeout' }, false).length, 0)
  assert.equal(analyzeTls(host, 443, { protocol: 'TLSv1.3', validTo: '2000-01-01T00:00:00Z' })[0].severity, 'high')
})

test('port parser and cancelled socket checks are bounded', async () => {
  assert.deepEqual(parsePortSpec('80,443,80'), [80, 443])
  assert.throws(() => parsePortSpec('1-10001'), /excessive/)
  assert.throws(() => parsePortSpec('80,abc'), /Invalid/)
  const controller = new AbortController()
  controller.abort()
  assert.equal((await tcpConnect('127.0.0.1', 1, 1000, controller.signal)).status, 'cancelled')
})
