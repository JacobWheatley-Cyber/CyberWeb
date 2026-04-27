import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, LayoutDashboard, Settings } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from './Logo'
import { redTools, blueTools } from '../data/tools'
import type { Tool } from '../types'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

interface NavItemProps {
  tool: Tool
  collapsed: boolean
}

function NavItem({ tool, collapsed }: NavItemProps) {
  const Icon = tool.icon
  const isRed = tool.team === 'red'

  return (
    <NavLink
      to={tool.path}
      title={collapsed ? tool.name : undefined}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-all duration-150 relative overflow-hidden',
          'hover:bg-wire-2',
          isActive
            ? isRed
              ? 'bg-rose-500/10 text-rose-400'
              : 'bg-blue-500/10 text-blue-400'
            : 'text-slate-400 hover:text-slate-200',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId={`nav-indicator-${tool.team}`}
              className={clsx(
                'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r',
                isRed ? 'bg-rose-400' : 'bg-blue-400',
              )}
            />
          )}
          <Icon
            size={16}
            className={clsx(
              'flex-shrink-0 transition-colors',
              isActive
                ? isRed ? 'text-rose-400' : 'text-blue-400'
                : 'text-slate-500 group-hover:text-slate-300',
            )}
          />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="text-[13px] font-medium leading-none whitespace-nowrap overflow-hidden"
              >
                {tool.name}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  )
}

interface SectionProps {
  label: string
  team: 'red' | 'blue'
  tools: Tool[]
  collapsed: boolean
}

function NavSection({ label, team, tools, collapsed }: SectionProps) {
  const [expanded, setExpanded] = useState(true)
  const isRed = team === 'red'
  const location = useLocation()
  const hasActive = tools.some(t => location.pathname === t.path)

  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5">
        <div
          className={clsx(
            'h-px mx-2 my-1 rounded',
            isRed ? 'bg-rose-500/20' : 'bg-blue-500/20',
          )}
        />
        {tools.map(tool => (
          <NavItem key={tool.id} tool={tool} collapsed />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        onClick={() => setExpanded(e => !e)}
        className={clsx(
          'flex items-center justify-between px-2.5 py-1.5 rounded-md w-full',
          'text-[11px] font-semibold tracking-widest uppercase',
          'transition-colors duration-150 hover:bg-wire-2',
          isRed ? 'text-rose-500/70' : 'text-blue-500/70',
          hasActive && !expanded && (isRed ? 'text-rose-400' : 'text-blue-400'),
        )}
      >
        <span>{label}</span>
        <motion.div
          animate={{ rotate: expanded ? 0 : -90 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={12} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden flex flex-col gap-0.5"
          >
            {tools.map(tool => (
              <NavItem key={tool.id} tool={tool} collapsed={false} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()

  return (
    <motion.div
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative flex-shrink-0 flex flex-col h-full bg-surface-1 border-r border-wire-2 overflow-hidden z-20"
    >
      {/* Logo */}
      <div
        className={clsx(
          'flex items-center h-14 flex-shrink-0 border-b border-wire-1',
          collapsed ? 'justify-center px-0' : 'px-4',
        )}
      >
        <Logo collapsed={collapsed} size={28} />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 flex flex-col gap-1">
        {/* Dashboard */}
        <NavLink
          to="/"
          end
          title={collapsed ? 'Dashboard' : undefined}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-all duration-150',
              'hover:bg-wire-2',
              isActive
                ? 'bg-slate-700/40 text-slate-100'
                : 'text-slate-400 hover:text-slate-200',
              collapsed && 'justify-center px-0',
            )
          }
        >
          {({ isActive }) => (
            <>
              <LayoutDashboard
                size={16}
                className={clsx('flex-shrink-0', isActive ? 'text-slate-200' : 'text-slate-500')}
              />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="text-[13px] font-medium whitespace-nowrap overflow-hidden"
                  >
                    Dashboard
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          )}
        </NavLink>

        {!collapsed && (
          <div className="h-px bg-wire-1 my-1" />
        )}

        {/* Red Team */}
        <NavSection label="Red Team" team="red" tools={redTools} collapsed={collapsed} />

        {!collapsed && (
          <div className="h-px bg-wire-1 my-1" />
        )}

        {/* Blue Team */}
        <NavSection label="Blue Team" team="blue" tools={blueTools} collapsed={collapsed} />
      </nav>

      {/* Settings at bottom */}
      <div className="flex-shrink-0 border-t border-wire-1 p-2">
        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-all duration-150 w-full',
              'hover:bg-wire-2',
              isActive
                ? 'bg-slate-700/40 text-slate-100'
                : 'text-slate-400 hover:text-slate-200',
              collapsed && 'justify-center px-0',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Settings
                size={16}
                className={clsx('flex-shrink-0', isActive ? 'text-slate-200' : 'text-slate-500')}
              />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="text-[13px] font-medium whitespace-nowrap overflow-hidden"
                  >
                    Settings
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          )}
        </NavLink>
      </div>
    </motion.div>
  )
}
