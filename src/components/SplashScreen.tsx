import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const BOOT_LINES = [
  { text: 'Loading threat intelligence engine', delay: 400 },
  { text: 'Initializing vulnerability database', delay: 900 },
  { text: 'Establishing secure channels', delay: 1400 },
  { text: 'Mounting network interfaces', delay: 1800 },
  { text: 'All systems nominal', delay: 2250, ok: true },
]

const EXIT_DELAY = 2900

function CornerBracket({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const rot = { tl: 0, tr: 90, br: 180, bl: 270 }[pos]
  const cls = { tl: 'top-6 left-6', tr: 'top-6 right-6', bl: 'bottom-6 left-6', br: 'bottom-6 right-6' }[pos]
  return (
    <motion.div
      className={`absolute ${cls} w-10 h-10`}
      style={{ rotate: rot }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
        <path d="M2 22 L2 2 L22 2" stroke="rgba(34,211,238,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.div>
  )
}

function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="splashLogoGradMain" x1="10" y1="4" x2="30" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="splashLogoGradFill" x1="10" y1="4" x2="30" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.07" />
        </linearGradient>
      </defs>

      {/* Pointy-top hexagon frame */}
      <path
        d="M20 4 L33.9 12 L33.9 28 L20 36 L6.1 28 L6.1 12 Z"
        fill="url(#splashLogoGradFill)"
        stroke="url(#splashLogoGradMain)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* W-shaped circuit trace */}
      <polyline
        points="10,15 14.5,25 20,18 25.5,25 30,15"
        stroke="url(#splashLogoGradMain)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      />

      {/* Top nodes — blue */}
      <circle cx="10" cy="15" r="2.1" fill="#60a5fa" opacity="0.95" />
      <circle cx="30" cy="15" r="2.1" fill="#60a5fa" opacity="0.95" />

      {/* Valley nodes — emerald */}
      <circle cx="14.5" cy="25" r="1.7" fill="#34d399" opacity="0.85" />
      <circle cx="25.5" cy="25" r="1.7" fill="#34d399" opacity="0.85" />

      {/* Center hub — gradient, largest */}
      <circle cx="20" cy="18" r="2.8" fill="url(#splashLogoGradMain)" />
    </svg>
  )
}

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true)
  const [shownLines, setShownLines] = useState<number[]>([])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    BOOT_LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setShownLines(prev => [...prev, i]), line.delay))
    })

    timers.push(setTimeout(() => setVisible(false), EXIT_DELAY))
    timers.push(setTimeout(onDone, EXIT_DELAY + 700))

    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="fixed inset-0 z-[99999] flex items-center justify-center overflow-hidden"
          style={{ background: '#04070f' }}
        >
          {/* Dot-grid background */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(30,58,95,0.18) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          {/* Radial glow behind logo */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 500, height: 500,
              background: 'radial-gradient(circle, rgba(96,165,250,0.07) 0%, transparent 70%)',
              top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Scan line */}
          <motion.div
            className="absolute left-0 right-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(to right, transparent, rgba(34,211,238,0.45), transparent)' }}
            initial={{ top: '10%', opacity: 0 }}
            animate={{ top: '90%', opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.2, ease: 'linear', delay: 0.2 }}
          />

          {/* Corner brackets */}
          <CornerBracket pos="tl" />
          <CornerBracket pos="tr" />
          <CornerBracket pos="bl" />
          <CornerBracket pos="br" />

          {/* Thin edge rules */}
          <motion.div className="absolute left-0 right-0 h-px" style={{ top: '15%', background: 'rgba(34,211,238,0.05)' }}
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />
          <motion.div className="absolute left-0 right-0 h-px" style={{ bottom: '15%', background: 'rgba(34,211,238,0.05)' }}
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />

          {/* Version badge */}
          <motion.div
            className="absolute bottom-8 right-10 text-[10px] font-mono tracking-widest"
            style={{ color: 'rgba(34,211,238,0.25)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            v1.0.0 — SECURE BUILD
          </motion.div>

          {/* Center content */}
          <div className="relative flex flex-col items-center gap-10">

            {/* Logo mark + wordmark */}
            <motion.div
              className="flex flex-col items-center gap-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Icon with glow rings */}
              <div className="relative flex items-center justify-center">
                <motion.div
                  className="absolute rounded-full border border-blue-400/15"
                  style={{ width: 130, height: 130 }}
                  animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="absolute rounded-full border border-emerald-400/08"
                  style={{ width: 170, height: 170 }}
                  animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                />

                {/* Drop shadow glow behind the SVG */}
                <div style={{ filter: 'drop-shadow(0 0 24px rgba(96,165,250,0.45)) drop-shadow(0 0 8px rgba(52,211,153,0.3))' }}>
                  <LogoMark size={96} />
                </div>
              </div>

              {/* Wordmark — matches sidebar exactly, just larger */}
              <motion.div
                className="flex items-baseline gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.45 }}
              >
                <span className="text-slate-100 font-semibold tracking-tight" style={{ fontSize: 36, lineHeight: 1 }}>
                  Cyber
                </span>
                <span
                  className="font-semibold tracking-tight"
                  style={{
                    fontSize: 36, lineHeight: 1,
                    background: 'linear-gradient(135deg, #60a5fa, #34d399)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Web
                </span>
              </motion.div>

              {/* Tagline */}
              <motion.p
                className="text-[11px] tracking-[0.45em] uppercase font-medium"
                style={{ color: 'rgba(34,211,238,0.5)', marginTop: -12 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.5 }}
              >
                Security Operations Platform
              </motion.p>
            </motion.div>

            {/* Boot log */}
            <motion.div
              className="w-80 space-y-1.5 font-mono"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            >
              {BOOT_LINES.map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: shownLines.includes(i) ? 1 : 0, x: shownLines.includes(i) ? 0 : -6 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center justify-between gap-3 text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span style={{ color: 'rgba(34,211,238,0.4)' }}>›</span>
                    <span className={line.ok ? 'text-emerald-300' : 'text-slate-500'}>{line.text}</span>
                  </div>
                  {shownLines.includes(i) && (
                    <span className={`flex-shrink-0 text-[10px] font-bold tracking-widest ${line.ok ? 'text-emerald-400' : 'text-cyan-400/50'}`}>
                      {line.ok ? 'OK' : '...'}
                    </span>
                  )}
                </motion.div>
              ))}
            </motion.div>

            {/* Progress bar */}
            <motion.div
              className="w-80 rounded-full overflow-hidden"
              style={{ height: 1, background: 'rgba(255,255,255,0.06)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(to right, #60a5fa, #34d399)' }}
                initial={{ width: '0%' }}
                animate={{ width: `${(shownLines.length / BOOT_LINES.length) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </motion.div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
