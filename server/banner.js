// ANSI escape helpers
const R  = '\x1b[0m'
const B  = '\x1b[1m'
const DIM = '\x1b[2m'

const CYAN    = '\x1b[36m'
const BCYAN   = '\x1b[96m'
const BLUE    = '\x1b[34m'
const BBLUE   = '\x1b[94m'
const GREEN   = '\x1b[32m'
const BGREEN  = '\x1b[92m'
const YELLOW  = '\x1b[33m'
const BYELLOW = '\x1b[93m'
const RED     = '\x1b[31m'
const BRED    = '\x1b[91m'
const WHITE   = '\x1b[97m'
const GRAY    = '\x1b[90m'
const MGENTA  = '\x1b[95m'

// CYBERWEB in ANSI Shadow block letters
const LOGO = [
  [BCYAN,  '  ██████╗██╗   ██╗██████╗ ███████╗██████╗ ██╗    ██╗███████╗██████╗  '],
  [BCYAN,  ' ██╔════╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██║    ██║██╔════╝██╔══██╗ '],
  [CYAN,   ' ██║      ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║ █╗ ██║█████╗  ██████╔╝ '],
  [CYAN,   ' ██║       ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██╗██║███╗██║██╔══╝  ██╔══██╗ '],
  [BBLUE,  ' ╚██████╗   ██║   ██████╔╝███████╗██║  ██║╚███╔███╔╝███████╗██████╔╝  '],
  [BBLUE,  '  ╚═════╝   ╚═╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝╚══════╝╚═════╝   '],
]

const W = 74
const SEP     = `${GRAY}${'─'.repeat(W)}${R}`
const SEP_BOLD= `${DIM}${CYAN}${'═'.repeat(W)}${R}`

function center(text, width = W) {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '')
  const pad = Math.max(0, Math.floor((width - stripped.length) / 2))
  return ' '.repeat(pad) + text
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

export function printBanner(role, port) {
  process.stdout.write('\x1b[2J\x1b[H') // clear + move cursor home

  const lines = [
    '',
    ...LOGO.map(([col, text]) => `${col}${B}${text}${R}`),
    '',
    SEP_BOLD,
    center(`${GRAY}Offensive & Defensive Security Platform${R}`),
    SEP_BOLD,
    '',
  ]

  if (role === 'api') {
    lines.push(
      `  ${BGREEN}●${R}  ${B}${WHITE}API Server${R}       ${GRAY}→${R}  ${BCYAN}http://localhost:${port}${R}`,
      `  ${GRAY}●${R}  ${GRAY}Web Interface${R}    ${GRAY}→${R}  ${GRAY}http://localhost:5173${R}`,
      '',
      SEP,
      `  ${BGREEN}◆${R}  ${GRAY}Server ready — awaiting scan requests${R}`,
      `  ${DIM}${GRAY}◆  Endpoints: /api/scan  /api/vuln-scan  /api/health  /api/activity${R}`,
      SEP,
    )
  } else {
    lines.push(
      `  ${GRAY}●${R}  ${GRAY}API Server${R}       ${GRAY}→${R}  ${GRAY}http://localhost:3001${R}`,
      `  ${BGREEN}●${R}  ${B}${WHITE}Web Interface${R}    ${GRAY}→${R}  ${BCYAN}http://localhost:${port}${R}`,
      '',
      SEP,
      `  ${BYELLOW}◆${R}  ${GRAY}UI server ready — press ${WHITE}Ctrl+C${GRAY} to stop${R}`,
      `  ${DIM}${GRAY}◆  Hot module replacement active${R}`,
      SEP,
    )
  }

  lines.push('')
  console.log(lines.join('\n'))
}

export function logScan(type, target, mode, status, detail = '') {
  const ts    = `${GRAY}[${timestamp()}]${R}`
  const badge = type === 'vuln'
    ? `${BRED}${B} VULN ${R}`
    : `${BCYAN}${B} SCAN ${R}`
  const arrow = status === 'start'    ? `${BBLUE}←${R}` : `${BGREEN}→${R}`
  const info  = status === 'start'
    ? `${GRAY}started${R}`
    : `${BGREEN}complete${R}  ${GRAY}${detail}${R}`
  const modeStr = `${GRAY}${mode.padEnd(10)}${R}`

  console.log(`  ${ts}  ${badge}  ${WHITE}${target.padEnd(22)}${R}  ${modeStr}  ${arrow}  ${info}`)
}

export function logError(msg) {
  const ts = `${GRAY}[${timestamp()}]${R}`
  console.log(`  ${ts}  ${BRED}${B} ERR  ${R}  ${RED}${msg}${R}`)
}
