import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveScanTargets, resolveSingleTarget } from './targetPolicy.js'
import { parsePortSpec } from './portScanner.js'

test('scan targets accept public and private IPv4 without configuration', async () => {
  assert.equal(await resolveSingleTarget('127.0.0.1'), '127.0.0.1')
  assert.equal(await resolveSingleTarget('203.0.113.7'), '203.0.113.7')
  assert.equal(await resolveSingleTarget('198.51.100.8'), '198.51.100.8')
  assert.deepEqual(await resolveScanTargets('192.168.1.0/30'), ['192.168.1.1', '192.168.1.2'])
  assert.deepEqual(await resolveScanTargets('203.0.113.0/30'), ['203.0.113.1', '203.0.113.2'])
  assert.deepEqual(await resolveScanTargets('127.0.0.1/32'), ['127.0.0.1'])
})

test('malformed and oversized targets are rejected', async () => {
  await assert.rejects(resolveScanTargets('127.0.0.1 & whoami'), /valid IPv4/)
  await assert.rejects(resolveScanTargets('999.1.1.1'), /valid IPv4/)
  await assert.rejects(resolveScanTargets('192.168.0.0/21'), /too large/)
  await assert.rejects(resolveScanTargets('203.0.113.0/'), /Invalid IPv4 CIDR/)
  await assert.rejects(resolveScanTargets('203.0.113.0/33'), /Invalid IPv4 CIDR/)
})

test('port specifications reject malformed or excessive input', () => {
  assert.deepEqual(parsePortSpec('22,80-82,22'), [22, 80, 81, 82])
  assert.throws(() => parsePortSpec('80garbage'), /Invalid port/)
  assert.throws(() => parsePortSpec('70000-80000'), /Invalid range/)
  assert.throws(() => parsePortSpec('1-10000,10001'), /Maximum 10,000/)
})
