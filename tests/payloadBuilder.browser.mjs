import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import express from 'express'
import puppeteer from 'puppeteer'
import { fileURLToPath } from 'node:url'
import { createPayloadService, createPayloadRouter } from '../server/payloadBuilder.js'
import { PAYLOAD_TEMPLATES } from '../src/lib/payloadBuilder.js'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const app = express(); app.use(express.json())
let available = true
let timestamp = Date.now()
// Only this test injects a fixture compiler. Production never uses this path.
const service = createPayloadService({ now: () => timestamp, env: { CYBERWEB_MSF_MODE: 'native' }, run: async (_file, args) => {
  if (!available) throw new Error('Test compiler unavailable')
  if (args.includes('--list')) return { stdout: Buffer.from(PAYLOAD_TEMPLATES.map(item => item.module).join('\n')) }
  return { stdout: args.includes('elf') ? Buffer.from([127, 69, 76, 70, 0, 255]) : Buffer.from([77, 90, 0, 255]) }
} })
app.use('/api/payloads', createPayloadRouter((req, res, next) => req.headers['x-api-key'] === 'browser-test-only' ? next() : res.status(401).json({ error: 'Unauthorized' }), service))
app.use(express.static(root)); app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')))
const server = app.listen(0, '127.0.0.1')
await new Promise(resolve => server.once('listening', resolve))
const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyberweb-payload-ui-'))
let browser
try {
  browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []; page.on('pageerror', err => errors.push(err.message))
  await page.setViewport({ width: 1280, height: 900 })
  const base = `http://127.0.0.1:${server.address().port}`
  await page.goto(base + '/tools/payload-builder')
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('API key'))
  await page.evaluate(() => sessionStorage.setItem('cyberweb-session-secrets', JSON.stringify({ serverApiKey: 'browser-test-only', apiKeys: {} })))
  await page.reload()
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Ready'))
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Tool manual')).click())
  await page.waitForSelector('dialog[open]')
  assert.ok((await page.$eval('dialog', el => el.textContent)).includes('Connect to the API'))
  await page.click('[aria-label="Next manual page"]')
  await page.waitForFunction(() => document.querySelector('dialog article h3')?.textContent === 'Install the payload compiler')
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => document.querySelector('dialog article h3')?.textContent === 'Configure CyberWeb')
  await page.keyboard.press('Escape')
  assert.equal(await page.$('dialog[open]'), null)
  await page.select('[aria-label="Platform and architecture"]', 'linux-x64')
  assert.equal(await page.$eval('[aria-label="Output format"]', el => el.value), 'elf')
  await page.type('[aria-label="Callback host"]', '192.0.2.10;calc')
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Generate payload')).disabled), true)
  await page.$eval('[aria-label="Callback host"]', el => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, '192.0.2.10'); el.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent.includes('Generate payload') && !el.disabled))
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Generate payload')).click())
  await page.waitForSelector('[data-testid="artifact"]')
  assert.ok((await page.$eval('[data-testid="artifact"]', el => el.textContent)).includes('linux/x64/shell_reverse_tcp'))
  const client = await page.createCDPSession()
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Download payload')).click())
  let downloaded
  for (let attempt = 0; attempt < 30; attempt++) {
    downloaded = (await fs.readdir(downloadDir)).find(name => name.endsWith('.elf'))
    if (downloaded) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(downloaded, 'Binary artifact downloaded')
  assert.deepEqual(await fs.readFile(path.join(downloadDir, downloaded)), Buffer.from([127, 69, 76, 70, 0, 255]))
  await page.setViewport({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  // Failed builds surface the backend error without retaining a previous artifact.
  available = false
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Generate payload')).click())
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('could not build'))
  assert.equal(await page.$('[data-testid="artifact"]'), null)
  timestamp += 31000
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Recheck compiler')).click())
  await page.waitForFunction(() => document.querySelector('#payload-build-requirement')?.textContent?.includes('Metasploit is unavailable'))
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Generate payload')).disabled), true)
  await page.click('details summary')
  assert.ok((await page.$eval('details', el => el.textContent)).includes('sudo apt install metasploit-framework'))
  await page.goto(base + '/tools/web-scanner')
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Tool manual')).click())
  await page.waitForSelector('dialog[open]')
  assert.ok((await page.$eval('dialog article', el => el.textContent)).includes('awaiting implementation'))
  await page.click('[aria-label="Close manual"]')
  assert.deepEqual(errors, [])
  console.log('Browser checks passed: payload generation/download, disabled-button explanation, compiler setup, manual page navigation, Escape, planned-tool guidance, mobile layout.')
} finally {
  if (browser) await browser.close()
  await new Promise(resolve => server.close(resolve))
  await fs.rm(downloadDir, { recursive: true, force: true })
}
