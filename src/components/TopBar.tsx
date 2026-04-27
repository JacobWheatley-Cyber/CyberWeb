import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import { allTools } from '../data/tools'
import { useProfileContext } from '../context/ProfileContext'
import { getInitials, STATUS_CONFIG } from '../hooks/useProfile'

interface TopBarProps {
  sidebarCollapsed: boolean
  onMenuToggle: () => void
}

function useBreadcrumb() {
  const location = useLocation()
  const path = location.pathname

  if (path === '/') return [{ label: 'Dashboard', href: '/' }]
  if (path === '/settings') return [{ label: 'Settings', href: '/settings' }]
  if (path === '/profile') return [{ label: 'Profile', href: '/profile' }]

  if (path.startsWith('/tools/')) {
    const toolId = path.replace('/tools/', '')
    const tool = allTools.find(t => t.id === toolId)
    return [
      { label: tool?.team === 'red' ? 'Red Team' : 'Blue Team', href: '#' },
      { label: tool?.name ?? 'Tool', href: path },
    ]
  }

  return [{ label: 'CyberWeb', href: '/' }]
}

export function TopBar({ sidebarCollapsed, onMenuToggle }: TopBarProps) {
  const crumbs = useBreadcrumb()
  const navigate = useNavigate()
  const { profile } = useProfileContext()
  const initials = getInitials(profile.displayName)
  const statusDot = STATUS_CONFIG[profile.status].dot

  return (
    <header className="flex-shrink-0 h-14 flex items-center justify-between px-4 gap-4 border-b border-wire-1 bg-surface-0/90 backdrop-blur-sm z-10">
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0">
        <motion.button
          onClick={onMenuToggle}
          whileTap={{ scale: 0.92 }}
          className="flex-shrink-0 p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-wire-2 transition-colors duration-150"
          aria-label="Toggle sidebar"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={sidebarCollapsed ? 'open' : 'close'}
              initial={{ opacity: 0, rotate: -15 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 15 }}
              transition={{ duration: 0.15 }}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </motion.div>
          </AnimatePresence>
        </motion.button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          {crumbs.map((crumb, i) => (
            <span key={crumb.href + i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />}
              <span
                className={clsx(
                  'truncate',
                  i === crumbs.length - 1
                    ? 'text-slate-200 font-medium'
                    : 'text-slate-500',
                )}
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>
      </div>

      {/* Center — search */}
      <div className="hidden md:flex items-center flex-1 max-w-md">
        <div className="relative w-full group">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-slate-400 transition-colors" />
          <input
            type="text"
            placeholder="Search tools, hosts, IOCs…"
            className={clsx(
              'w-full bg-wire-1 border border-wire-2 rounded-md',
              'pl-8 pr-12 py-1.5 text-[13px] text-slate-300 placeholder:text-slate-600',
              'outline-none focus:border-blue-500/40 focus:bg-surface-2 transition-all duration-200',
            )}
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-mono bg-wire-2 border border-wire-3 px-1 py-0.5 rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* System status indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-wire-1 border border-wire-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-[12px] text-slate-400 font-medium">Systems Nominal</span>
        </div>

        {/* Notifications */}
        <button className="relative p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-wire-2 transition-colors duration-150">
          <Bell size={17} />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
        </button>

        {/* Avatar */}
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-md hover:bg-wire-2 transition-colors duration-150"
        >
          <div className="relative flex-shrink-0">
            <div
              className="h-7 w-7 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-bold text-white"
              style={{ backgroundColor: profile.avatarUrl ? undefined : profile.avatarColor }}
            >
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                : initials}
            </div>
            <span className={clsx('absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-surface-0', statusDot)} />
          </div>
          <span className="hidden lg:block text-[13px] text-slate-300 font-medium">
            {profile.displayName}
          </span>
        </button>
      </div>
    </header>
  )
}
