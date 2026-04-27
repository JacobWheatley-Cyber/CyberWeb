import { motion } from 'framer-motion'

interface LogoProps {
  collapsed?: boolean
  size?: number
}

export function Logo({ collapsed = false, size = 32 }: LogoProps) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        <defs>
          <linearGradient id="logoGradMain" x1="10" y1="4" x2="30" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <linearGradient id="logoGradFill" x1="10" y1="4" x2="30" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Pointy-top hexagon frame */}
        <path
          d="M20 4 L33.9 12 L33.9 28 L20 36 L6.1 28 L6.1 12 Z"
          fill="url(#logoGradFill)"
          stroke="url(#logoGradMain)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* W-shaped circuit trace */}
        <polyline
          points="10,15 14.5,25 20,18 25.5,25 30,15"
          stroke="url(#logoGradMain)"
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
        <circle cx="20" cy="18" r="2.8" fill="url(#logoGradMain)" />
      </motion.svg>

      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex items-baseline gap-0.5"
        >
          <span className="text-slate-100 font-semibold tracking-tight text-base leading-none">
            Cyber
          </span>
          <span className="text-gradient-blue font-semibold tracking-tight text-base leading-none">
            Web
          </span>
        </motion.div>
      )}
    </div>
  )
}
