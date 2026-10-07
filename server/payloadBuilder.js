import express from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID, createHash } from 'node:crypto'
import { buildPayloadRequest, PAYLOAD_TEMPLATES } from '../src/lib/payloadBuilder.js'

const runFile = promisify(execFile)
const MAX_BYTES = 8 * 1024 * 1024
const TTL = 60 * 60 * 1000

export function engineCommand(env = process.env, platform = process.platform) {
  const mode = env.CYBERWEB_MSF_MODE || (platform === 'win32' ? 'wsl' : 'native')
  if (!['native', 'wsl'].includes(mode)) throw new Error('CYBERWEB_MSF_MODE must be native or wsl.')
  const executable = env.CYBERWEB_MSF_PATH || (mode === 'wsl' ? '/usr/bin/msfvenom' : 'msfvenom')
  if (mode === 'native') return { executable, prefix: [], mode }
  const distro = env.CYBERWEB_MSF_DISTRO
  return { executable: 'wsl.exe', prefix: [...(distro ? ['--distribution', distro] : []), '--exec', executable], mode }
}

export function createPayloadService({ run = runFile, env = process.env, platform = process.platform, now = Date.now } = {}) {
  const artifacts = new Map()
  let busy = false
  let statusCheck
  let statusCheckedAt = 0
  let checkingStatus = false
  function prune() {
    for (const [id, artifact] of artifacts) if (artifact.expiresAt <= now()) artifacts.delete(id)
  }
  async function execute(args, timeout) {
    const engine = engineCommand(env, platform)
    return run(engine.executable, [...engine.prefix, ...args], {
      encoding: 'buffer', timeout, maxBuffer: MAX_BYTES, windowsHide: true, shell: false,
    })
  }
  return {
    status() {
      if (statusCheck && (checkingStatus || now() - statusCheckedAt < 30000)) return statusCheck
      checkingStatus = true
      statusCheck = (async () => {
        try {
          const { stdout } = await execute(['--list', 'payloads'], 60000)
          const modules = Buffer.from(stdout).toString().split(/\s+/)
          if (!PAYLOAD_TEMPLATES.every(item => modules.includes(item.module))) throw new Error('Required modules unavailable.')
          return { available: true, mode: engineCommand(env, platform).mode, templates: PAYLOAD_TEMPLATES }
        } catch {
          return { available: false, mode: env.CYBERWEB_MSF_MODE || (platform === 'win32' ? 'wsl' : 'native'), templates: PAYLOAD_TEMPLATES,
            message: 'Metasploit compiler or required shell modules unavailable. Install msfvenom on the API host (or in WSL on Windows), configure CYBERWEB_MSF_* in .env, then retry.' }
        } finally { checkingStatus = false; statusCheckedAt = now() }
      })()
      return statusCheck
    },
    async generate(input) {
      let request
      try { request = buildPayloadRequest(input) } catch (err) { throw Object.assign(err, { status: 400 }) }
      if (busy) throw Object.assign(new Error('A payload build is already running. Try again after it finishes.'), { status: 429 })
      busy = true
      try {
        prune()
        let result
        try { result = await execute(request.args, 120000) }
        catch (err) {
          const message = err.killed ? 'Compiler exceeded the two-minute build limit.' : 'msfvenom could not build this payload. Check the compiler installation and selected module on the API host.'
          throw Object.assign(new Error(message), { status: err.killed ? 504 : 503 })
        }
        const bytes = Buffer.from(result.stdout)
        const signatureValid = request.format === 'raw' || (request.format === 'exe' ? bytes.subarray(0, 2).equals(Buffer.from('MZ')) : bytes.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])))
        if (!bytes.length || bytes.length > MAX_BYTES || !signatureValid) throw Object.assign(new Error('Compiler did not return a valid artifact for the selected format.'), { status: 502 })
        const id = randomUUID()
        const extension = request.format === 'raw' ? 'bin' : request.format
        const metadata = { id, filename: `cyberweb-${request.template.id}-${id.slice(0, 8)}.${extension}`,
          module: request.template.module, platform: request.template.platform, arch: request.template.arch, format: request.format,
          host: request.host, port: request.port, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
          createdAt: new Date(now()).toISOString(), expiresAt: new Date(now() + TTL).toISOString(), handler: request.handler,
          preview: bytes.subarray(0, 64).toString('hex').match(/.{1,2}/g).join(' ') }
        while (artifacts.size >= 8) artifacts.delete(artifacts.keys().next().value)
        artifacts.set(id, { bytes, metadata, expiresAt: now() + TTL })
        return metadata
      } finally { busy = false }
    },
    get(id) { prune(); return artifacts.get(id) },
  }
}

export function createPayloadRouter(requireApiKey, service = createPayloadService()) {
  const router = express.Router()
  router.use(requireApiKey)
  router.get('/status', async (_req, res) => res.json(await service.status()))
  router.post('/generate', async (req, res) => {
    try { res.json(await service.generate(req.body)) }
    catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : 'Payload build failed.' }) }
  })
  router.get('/artifacts/:id', (req, res) => {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(req.params.id)) return res.status(404).json({ error: 'Artifact not found.' })
    const artifact = service.get(req.params.id)
    if (!artifact) return res.status(404).json({ error: 'Artifact expired or API restarted. Generate it again.' })
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.metadata.filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(artifact.bytes)
  })
  return router
}
