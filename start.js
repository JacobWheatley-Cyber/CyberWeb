import { spawn }        from 'child_process'
import { createInterface } from 'readline'
import { stat, access, readFile }  from 'fs/promises'
import path              from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))

// Load .env into process.env so child processes inherit the values
try {
  const raw = await readFile(path.join(__dir, '.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch { /* no .env file — env vars must be set externally */ }

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const R      = '\x1b[0m'
const B      = '\x1b[1m'
const DIM    = '\x1b[2m'
const CYAN   = '\x1b[36m'
const BCYAN  = '\x1b[96m'
const BBLUE  = '\x1b[94m'
const BGREEN = '\x1b[92m'
const WHITE  = '\x1b[97m'
const GRAY   = '\x1b[90m'
const BRED   = '\x1b[91m'
const YELLOW = '\x1b[93m'

const W        = 74
const SEP      = `${GRAY}${'─'.repeat(W)}${R}`
const SEP_BOLD = `${DIM}${CYAN}${'═'.repeat(W)}${R}`

const LOGO = [
  [BCYAN, '  ██████╗██╗   ██╗██████╗ ███████╗██████╗ ██╗    ██╗███████╗██████╗  '],
  [BCYAN, ' ██╔════╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██║    ██║██╔════╝██╔══██╗ '],
  [CYAN,  ' ██║      ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║ █╗ ██║█████╗  ██████╔╝ '],
  [CYAN,  ' ██║       ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██╗██║███╗██║██╔══╝  ██╔══██╗ '],
  [BBLUE, ' ╚██████╗   ██║   ██████╔╝███████╗██║  ██║╚███╔███╔╝███████╗██████╔╝  '],
  [BBLUE, '  ╚═════╝   ╚═╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝╚══════╝╚═════╝   '],
]

const SWEEP = [WHITE, WHITE, BCYAN, BCYAN, BBLUE, BBLUE]

function sleep(ms)   { return new Promise(r => setTimeout(r, ms)) }
function write(s)    { process.stdout.write(s) }
function up(n)       { write(`\x1b[${n}A`) }
function eraseLine() { write('\x1b[2K\r') }
function center(text, w = W) {
  const vis = text.replace(/\x1b\[[0-9;]*m/g, '')
  const pad = Math.max(0, Math.floor((w - vis.length) / 2))
  return ' '.repeat(pad) + text
}

// ── Animated banner ───────────────────────────────────────────────────────────

async function animateBanner() {
  write('\x1b[2J\x1b[H')
  write('\n')

  for (const [col, text] of LOGO) {
    write(`${DIM}${col}${B}${text}${R}\n`)
    await sleep(60)
  }
  await sleep(90)

  up(LOGO.length)
  for (let i = 0; i < LOGO.length; i++) {
    const [, text] = LOGO[i]
    eraseLine()
    write(`${B}${SWEEP[i]}${text}${R}\n`)
    await sleep(30)
  }
  await sleep(80)

  up(LOGO.length)
  for (const [col, text] of LOGO) {
    eraseLine()
    write(`${B}${col}${text}${R}\n`)
    await sleep(22)
  }
  await sleep(120)
}

// ── Dependency checker ────────────────────────────────────────────────────────

const npmCmd = 'npm'

// Reads package.json and returns { dependencies, devDependencies }
async function readPackageJson() {
  const { createRequire } = await import('module')
  const req = createRequire(import.meta.url)
  return req('./package.json')
}

async function checkDepsStale() {
  const nmDir   = path.join(__dir, 'node_modules')
  const pkgPath = path.join(__dir, 'package.json')
  // The internal lock npm writes after a successful install
  const lockPath = path.join(__dir, 'node_modules', '.package-lock.json')

  // 1. node_modules doesn't exist at all
  try { await access(nmDir) } catch { return { needed: true, reason: 'node_modules not found' } }

  // 2. package.json is newer than the installed lock — deps may have changed
  try {
    const [pkgStat, lockStat] = await Promise.all([stat(pkgPath), stat(lockPath)])
    if (pkgStat.mtimeMs > lockStat.mtimeMs) {
      return { needed: true, reason: 'package.json updated since last install' }
    }
  } catch {
    return { needed: true, reason: 'install state unknown' }
  }

  // 3. Spot-check a handful of critical packages actually exist on disk
  const pkg = await readPackageJson()
  const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  for (const dep of allDeps) {
    try { await access(path.join(__dir, 'node_modules', dep)) }
    catch { return { needed: true, reason: `missing package: ${dep}` } }
  }

  return { needed: false, reason: '' }
}

// Animated spinner while npm install runs
function startSpinner(label) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  const id = setInterval(() => {
    write(`\r  ${CYAN}${frames[i++ % frames.length]}${R}  ${label}`)
  }, 80)
  return () => clearInterval(id)
}

async function installDeps(reason) {
  write(SEP + '\n')
  write(`  ${YELLOW}◆${R}  ${B}${WHITE}Dependency check${R}  ${GRAY}${reason}${R}\n`)
  write(SEP + '\n\n')

  // Check Node version — need 18+ for built-in fetch
  const [major] = process.versions.node.split('.').map(Number)
  if (major < 18) {
    write(`  ${BRED}✖${R}  Node.js ${process.versions.node} detected — CyberWeb requires Node 18 or later.\n`)
    write(`  ${GRAY}   Download: https://nodejs.org${R}\n\n`)
    process.exit(1)
  }

  const stopSpinner = startSpinner(`Running npm install…`)

  return new Promise((resolve, reject) => {
    const npm = spawn(npmCmd, ['install'], {
      cwd:   __dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    const lines = []
    createInterface({ input: npm.stdout }).on('line', line => {
      const clean = line.trim()
      if (clean) lines.push(clean)
    })
    npm.stderr.on('data', d => {
      const s = d.toString().trim()
      // npm prints warnings to stderr — only surface actual errors
      if (s && !s.toLowerCase().startsWith('npm warn') && !s.toLowerCase().startsWith('npm notice')) {
        lines.push(`${BRED}${s}${R}`)
      }
    })

    npm.on('exit', code => {
      stopSpinner()
      write('\r\x1b[2K')   // erase spinner line

      if (code === 0) {
        write(`  ${BGREEN}✔${R}  ${B}${WHITE}Dependencies installed${R}\n\n`)
        resolve()
      } else {
        write(`  ${BRED}✖${R}  npm install failed (exit ${code})\n`)
        if (lines.length) {
          write('\n')
          lines.slice(-10).forEach(l => write(`  ${GRAY}${l}${R}\n`))
        }
        write('\n')
        reject(new Error(`npm install exited with code ${code}`))
      }
    })
  })
}

async function ensureDependencies() {
  const { needed, reason } = await checkDepsStale()
  if (needed) await installDeps(reason)
}

// ── Boot sequence ─────────────────────────────────────────────────────────────

async function main() {
  await animateBanner()

  write('\n')
  write(SEP_BOLD + '\n')
  write(center(`${GRAY}Offensive & Defensive Security Platform${R}`) + '\n')
  write(SEP_BOLD + '\n')
  write('\n')

  // Check + install dependencies before starting anything
  await ensureDependencies()

  write(SEP + '\n')
  write(`  ${YELLOW}◆${R}  ${GRAY}Initializing services…${R}\n`)
  write(SEP + '\n')
  write('\n')

  let apiReady  = false
  let viteReady = false

  function onBothReady() {
    write('\n')
    write(SEP + '\n')
    write(`  ${BGREEN}◆${R}  ${B}${WHITE}All systems operational${R}  ${GRAY}— press Ctrl+C to stop${R}\n`)
    write(`  ${DIM}${GRAY}◆  Endpoints: /api/scan  /api/vuln-scan  /api/port-scan  /api/threats  /api/phishing${R}\n`)
    write(SEP + '\n')
    write('\n')
    // Poll for tunnel URL (localtunnel starts 2 s after server boot)
    waitForTunnel()
  }

  async function waitForTunnel() {
    write(`  ${YELLOW}○${R}  ${GRAY}Establishing public tunnel…${R}\n`)
    for (let i = 0; i < 24; i++) {
      await sleep(500)
      try {
        const r = await fetch('http://localhost:3001/api/phishing/tunnel')
        const { url, status } = await r.json()
        if (status === 'connected' && url) {
          // Erase the "Establishing…" line and replace with the URL
          write(`\x1b[1A\x1b[2K\r  ${BGREEN}●${R}  ${B}${WHITE}Public Tunnel${R}    ${GRAY}→${R}  ${BCYAN}${url}${R}  ${BGREEN}active${R}\n\n`)
          return
        }
        if (status === 'error') {
          write(`\x1b[1A\x1b[2K\r  ${YELLOW}●${R}  ${GRAY}Tunnel unavailable — set URL manually in Phishing Payload Builder${R}\n\n`)
          return
        }
      } catch { /* server not ready yet */ }
    }
    write(`\x1b[1A\x1b[2K\r  ${YELLOW}●${R}  ${GRAY}Tunnel timed out — set URL manually in Phishing Payload Builder${R}\n\n`)
  }

  // ── API server ──────────────────────────────────────────────────────────────
  const api = spawn(process.execPath, ['server/index.js'], {
    cwd: __dir,
    env: { ...process.env, NO_BANNER: '1' },
  })

  createInterface({ input: api.stdout }).on('line', line => {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '')
    if (!apiReady && clean.includes('SERVER_READY')) {
      apiReady = true
      write(`  ${BGREEN}●${R}  ${B}${WHITE}API Server${R}      ${GRAY}→${R}  ${BCYAN}http://localhost:3001${R}  ${BGREEN}ready${R}\n`)
      if (viteReady) onBothReady()
      return
    }
    if (clean.trim()) write('  ' + line + '\n')
  })

  api.stderr.on('data', d => {
    const s = d.toString().trim()
    if (s) write(`  ${BRED}[api err]${R} ${s}\n`)
  })

  // ── Vite dev server ─────────────────────────────────────────────────────────
  const viteBin = path.join(__dir, 'node_modules', 'vite', 'bin', 'vite.js')
  const vite = spawn(process.execPath, [viteBin, '--clearScreen', 'false'], {
    cwd: __dir,
    env: { ...process.env, FORCE_COLOR: '1' },
  })

  const VITE_SUPPRESS = /VITE v|Network:|press h|^\s*$|➜\s+Network/

  createInterface({ input: vite.stdout }).on('line', line => {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '')
    if (!viteReady && (clean.includes('Local:') || clean.includes('ready in'))) {
      viteReady = true
      write(`  ${BGREEN}●${R}  ${B}${WHITE}Web Interface${R}   ${GRAY}→${R}  ${BCYAN}http://localhost:5173${R}  ${BGREEN}ready${R}\n`)
      if (apiReady) onBothReady()
      return
    }
    if (clean.trim() && !VITE_SUPPRESS.test(clean)) write('  ' + line + '\n')
  })

  vite.stderr.on('data', d => {
    const s = d.toString().trim()
    if (s && !s.includes('ExperimentalWarning') && !s.includes('DeprecationWarning')) {
      write(`  ${BRED}[ui err]${R} ${s}\n`)
    }
  })

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  function shutdown() {
    write('\n' + SEP + '\n')
    write(`  ${GRAY}◆  Shutting down…${R}\n`)
    write(SEP + '\n\n')
    api.kill('SIGTERM')
    vite.kill('SIGTERM')
    setTimeout(() => process.exit(0), 400)
  }

  process.on('SIGINT',  shutdown)
  process.on('SIGTERM', shutdown)

  api.on('exit',  (code, sig) => { if (code && !sig) write(`\n  ${BRED}● API server exited (${code})${R}\n`) })
  vite.on('exit', (code, sig) => { if (code && !sig) write(`\n  ${BRED}● Vite exited (${code})${R}\n`) })
}

main().catch(err => {
  write(`\n  ${BRED}✖  Fatal error: ${err.message}${R}\n\n`)
  process.exit(1)
})
