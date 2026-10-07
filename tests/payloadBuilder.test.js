import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createHash } from 'node:crypto'
import { buildPayloadRequest, PAYLOAD_TEMPLATES } from '../src/lib/payloadBuilder.js'
import { createPayloadService, createPayloadRouter, engineCommand } from '../server/payloadBuilder.js'

const settings = { template: 'windows-x64', format: 'exe', host: '192.0.2.10', port: '4444' }
// Inert binary fixtures exercise the integration; they are not real payloads.
const exe = Buffer.from([77, 90, 0, 255, 128, 13, 10])
const elf = Buffer.from([127, 69, 76, 70, 0, 255])
const env = { CYBERWEB_MSF_MODE: 'native' }

test('each catalog selection produces constrained arguments and matching handler', () => {
  for (const item of PAYLOAD_TEMPLATES) for (const format of item.formats) {
    const request = buildPayloadRequest({ ...settings, template: item.id, format })
    assert.deepEqual(request.args, ['-p', item.module, 'LHOST=192.0.2.10', 'LPORT=4444', '-f', format])
    assert.ok(request.handler.includes(`set PAYLOAD ${item.module}\n`))
  }
  assert.equal(buildPayloadRequest({ ...settings, host: 'lab.example' }).host, 'lab.example')
})
test('rejects injection, unknown options, invalid ports and incompatible formats', () => {
  for (const host of ['127.0.0.1;calc', 'a\nset PAYLOAD other', '--help', 'https://lab.example', '999.1.1.1', '1.2.3', 'a b', '$(id)', '::1']) assert.throws(() => buildPayloadRequest({ ...settings, host }))
  for (const port of [0, 65536, 1.5, true, '4444\nrun', null]) assert.throws(() => buildPayloadRequest({ ...settings, port }))
  assert.throws(() => buildPayloadRequest({ ...settings, format: 'elf' }))
  assert.throws(() => buildPayloadRequest({ ...settings, template: 'arbitrary/module' }))
  assert.throws(() => buildPayloadRequest({ ...settings, args: ['-x', 'file'] }))
})
test('WSL execution uses argv, preserving configured paths without a command shell', () => {
  assert.deepEqual(engineCommand({ CYBERWEB_MSF_DISTRO: 'kali-linux', CYBERWEB_MSF_PATH: '/opt/msf/msfvenom' }, 'win32'), { executable: 'wsl.exe', prefix: ['--distribution', 'kali-linux', '--exec', '/opt/msf/msfvenom'], mode: 'wsl' })
  assert.throws(() => engineCommand({ CYBERWEB_MSF_MODE: 'shell' }))
})
test('binary output is preserved, hashed, expired and bounded to eight artifacts', async () => {
  let timestamp = 1000000
  const service = createPayloadService({ env, now: () => timestamp, run: async (_file, args, options) => {
    assert.equal(options.shell, false); assert.equal(options.encoding, 'buffer'); assert.equal(options.timeout, 120000)
    return { stdout: args.includes('elf') ? elf : exe }
  } })
  const first = await service.generate(settings)
  assert.deepEqual(service.get(first.id).bytes, exe)
  assert.equal(first.sha256, createHash('sha256').update(exe).digest('hex'))
  for (let index = 0; index < 8; index++) await service.generate(settings)
  assert.equal(service.get(first.id), undefined)
  const last = await service.generate({ ...settings, template: 'linux-x64', format: 'elf' })
  timestamp += 3600001
  assert.equal(service.get(last.id), undefined)
})
test('compiler failures, empty output and wrong file signatures never become downloads', async () => {
  for (const stdout of [Buffer.alloc(0), Buffer.from('Error compiling'), Buffer.alloc(8 * 1024 * 1024 + 1)]) {
    const service = createPayloadService({ env, run: async () => ({ stdout }) })
    await assert.rejects(service.generate(settings), error => error.status === 502)
  }
  const missing = createPayloadService({ env, run: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) } })
  assert.equal((await missing.status()).available, false)
  await assert.rejects(missing.generate(settings), error => error.status === 503)
  const timeout = createPayloadService({ env, run: async () => { throw { killed: true } } })
  await assert.rejects(timeout.generate(settings), error => error.status === 504)
})
test('concurrent generation is rejected and status verifies actual modules', async () => {
  let release
  const service = createPayloadService({ env, run: async () => new Promise(resolve => { release = () => resolve({ stdout: exe }) }) })
  const first = service.generate(settings)
  await assert.rejects(service.generate(settings), error => error.status === 429)
  release(); await first
  const available = createPayloadService({ env, run: async () => ({ stdout: Buffer.from(PAYLOAD_TEMPLATES.map(item => item.module).join('\n')) }) })
  assert.equal((await available.status()).available, true)
  const incomplete = createPayloadService({ env, run: async () => ({ stdout: Buffer.from('windows/shell_reverse_tcp') }) })
  assert.equal((await incomplete.status()).available, false)
})
test('HTTP endpoints require authentication and return exact binary downloads', async () => {
  const app = express(); app.use(express.json())
  app.use('/api/payloads', createPayloadRouter((req, res, next) => req.headers['x-api-key'] === 'test-only' ? next() : res.sendStatus(401), createPayloadService({ env, run: async () => ({ stdout: exe }) })))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/payloads`
  const headers = { 'x-api-key': 'test-only', 'Content-Type': 'application/json' }
  try {
    for (const path of ['/status', '/artifacts/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']) assert.equal((await fetch(base + path)).status, 401)
    assert.equal((await fetch(base + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })).status, 401)
    const response = await fetch(base + '/generate', { method: 'POST', headers, body: JSON.stringify(settings) })
    assert.equal(response.status, 200)
    const artifact = await response.json()
    assert.equal((await fetch(base + `/artifacts/${artifact.id}`)).status, 401)
    const download = await fetch(base + `/artifacts/${artifact.id}`, { headers })
    assert.equal(download.headers.get('content-type'), 'application/octet-stream')
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff')
    assert.match(download.headers.get('content-disposition'), /attachment/)
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), exe)
    assert.equal((await fetch(base + '/artifacts/not-an-id', { headers })).status, 404)
    assert.equal((await fetch(base + '/generate', { method: 'POST', headers, body: JSON.stringify({ ...settings, host: 'a;calc' }) })).status, 400)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
