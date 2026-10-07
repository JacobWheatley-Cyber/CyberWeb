import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const DATA_DIR = fileURLToPath(new URL('../.cyberweb-data/', import.meta.url))

export function loadLocalJson(name, fallback) {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'))
  } catch {
    return fallback
  }
}

export function saveLocalJson(name, value) {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  const path = join(DATA_DIR, name)
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
  renameSync(temp, path)
}
