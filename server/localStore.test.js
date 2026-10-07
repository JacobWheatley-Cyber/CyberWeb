import test from 'node:test'
import assert from 'node:assert/strict'
import { unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { loadLocalJson, saveLocalJson } from './localStore.js'

test('local JSON history can be replaced and reloaded', () => {
  const name = `test-${process.pid}.json`
  const path = fileURLToPath(new URL(`../.cyberweb-data/${name}`, import.meta.url))
  try {
    assert.deepEqual(loadLocalJson(name, []), [])
    saveLocalJson(name, [{ id: 'first' }])
    assert.deepEqual(loadLocalJson(name, []), [{ id: 'first' }])
    saveLocalJson(name, [{ id: 'second' }])
    assert.deepEqual(loadLocalJson(name, []), [{ id: 'second' }])
  } finally {
    try { unlinkSync(path) } catch {}
  }
})
