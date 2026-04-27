import { spawn } from 'child_process'
import { createInterface } from 'readline'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))

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

// Colors for the wave sweep — cycles top→bottom: white hot → cyan → blue
const SWEEP = [WHITE, WHITE, BCYAN, BCYAN, BBLUE, BBLUE]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function write(s)  { process.stdout.write(s) }
function up(n)     { write(`\x1b[${n}A`) }
function eraseLine() { write('\x1b[2K\r') }
function center(text, w = W) {
  const vis = text.replace(/\x1b\[[0-9;]*m/g, '')
  const pad = Math.max(0, Math.floor((w - vis.length) / 2))
  return ' '.repeat(pad) + text
}

// ── Animated banner ───────────────────────────────────────────────────────────

async function animateBanner() {
  write('\x1b[2J\x1b[H') // clear screen, cursor home
  write('\n')

  // Phase 1 — reveal rows one at a time, dimmed
  for (const [col, text] of LOGO) {
    write(`${DIM}${col}${B}${text}${R}\n`)
    await sleep(60)
  }

  await sleep(90)

  // Phase 2 — sweep a bright wave top→bottom (re-render each row in full colour)
  up(LOGO.length)
  for (let i = 0; i < LOGO.length; i++) {
    const [, text] = LOGO[i]
    eraseLine()
    write(`${B}${SWEEP[i]}${text}${R}\n`)
    await sleep(30)
  }

  await sleep(80)

  // Phase 3 — settle to final gradient colours
  up(LOGO.length)
  for (const [col, text] of LOGO) {
    eraseLine()
    write(`${B}${col}${text}${R}\n`)
    await sleep(22)
  }

  await sleep(120)
}

// ── Boot sequence ─────────────────────────────────────────────────────────────

async function main() {
  await animateBanner()

  write('\n')
  write(SEP_BOLD + '\n')
  write(center(`${GRAY}Offensive & Defensive Security Platform${R}`) + '\n')
  write(SEP_BOLD + '\n')
  write('\n')
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
    write(`  ${DIM}${GRAY}◆  Endpoints: /api/scan  /api/vuln-scan  /api/port-scan  /api/threats${R}\n`)
    write(SEP + '\n')
    write('\n')
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

    // Pass through scan logs and threat monitor lines, skip empty lines
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

  // Patterns to suppress from Vite's noisy output
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

main().catch(err => { console.error(err); process.exit(1) })
