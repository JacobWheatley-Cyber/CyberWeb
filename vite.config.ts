import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PORT = 5173

// Inline banner so vite.config.ts has no ESM/CJS import issues at config-parse time
function printUiBanner() {
  const R     = '\x1b[0m'
  const B     = '\x1b[1m'
  const DIM   = '\x1b[2m'
  const BCYAN = '\x1b[96m'
  const CYAN  = '\x1b[36m'
  const BBLUE = '\x1b[94m'
  const BGREEN= '\x1b[92m'
  const BYELLOW='\x1b[93m'
  const WHITE = '\x1b[97m'
  const GRAY  = '\x1b[90m'
  const W     = 74

  const LOGO = [
    [BCYAN,  '  ██████╗██╗   ██╗██████╗ ███████╗██████╗ ██╗    ██╗███████╗██████╗  '],
    [BCYAN,  ' ██╔════╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██║    ██║██╔════╝██╔══██╗ '],
    [CYAN,   ' ██║      ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║ █╗ ██║█████╗  ██████╔╝ '],
    [CYAN,   ' ██║       ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██╗██║███╗██║██╔══╝  ██╔══██╗ '],
    [BBLUE,  ' ╚██████╗   ██║   ██████╔╝███████╗██║  ██║╚███╔███╔╝███████╗██████╔╝  '],
    [BBLUE,  '  ╚═════╝   ╚═╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝╚══════╝╚═════╝   '],
  ]

  const SEP      = `${GRAY}${'─'.repeat(W)}${R}`
  const SEP_BOLD = `${DIM}${CYAN}${'═'.repeat(W)}${R}`

  function center(text) {
    const stripped = text.replace(/\x1b\[[0-9;]*m/g, '')
    const pad = Math.max(0, Math.floor((W - stripped.length) / 2))
    return ' '.repeat(pad) + text
  }

  process.stdout.write('\x1b[2J\x1b[H')
  console.log([
    '',
    ...LOGO.map(([col, text]) => `${col}${B}${text}${R}`),
    '',
    SEP_BOLD,
    center(`${GRAY}Offensive & Defensive Security Platform${R}`),
    SEP_BOLD,
    '',
    `  ${GRAY}●${R}  ${GRAY}API Server${R}       ${GRAY}→${R}  ${GRAY}http://localhost:3001${R}`,
    `  ${BGREEN}●${R}  ${B}${WHITE}Web Interface${R}    ${GRAY}→${R}  ${BCYAN}http://localhost:${PORT}${R}`,
    '',
    SEP,
    `  ${BYELLOW}◆${R}  ${GRAY}UI server ready — press ${WHITE}Ctrl+C${GRAY} to stop${R}`,
    `  ${DIM}${GRAY}◆  Hot module replacement active${R}`,
    SEP,
    '',
  ].join('\n'))
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'cyberweb-banner',
      configureServer(server) {
        // Override Vite's default printUrls so our banner is shown instead
        const original = server.printUrls.bind(server)
        server.printUrls = () => {
          printUiBanner()
        }
      },
    },
  ],
  server: {
    port: PORT,
    strictPort: true,
    clearScreen: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
