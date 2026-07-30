import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, ScanSearch, Info, ArrowUpRight, ShieldOff,
  Cpu, MemoryStick, Activity, Server, Clock,
} from 'lucide-react'
import { redTools, blueTools } from '../data/tools'
import { useSettingsContext } from '../context/SettingsContext'
import { apiFetch } from '../lib/api'

const allTools = [...redTools, ...blueTools]

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthData {
  cpu: number
  memory: number
  uptimeSeconds: number
  totalScansRun: number
  activeScans: { name: string; target: string; elapsedSeconds: number }[]
}

interface ActivityEntry {
  id: string
  type: 'alert' | 'block' | 'scan' | 'warning' | 'info'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  message: string
  tool: string
  timestamp: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUptime(secs: number) {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60) % 60
  const h = Math.floor(secs / 3600)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function activityIcon(type: ActivityEntry['type']) {
  switch (type) {
    case 'alert':   return <AlertTriangle size={13} className="text-rose-400 flex-shrink-0" />
    case 'block':   return <ShieldOff size={13} className="text-amber-400 flex-shrink-0" />
    case 'scan':    return <ScanSearch size={13} className="text-blue-400 flex-shrink-0" />
    case 'warning': return <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
    default:        return <Info size={13} className="text-slate-400 flex-shrink-0" />
  }
}

function severityBadge(s: ActivityEntry['severity']) {
  switch (s) {
    case 'critical': return 'bg-rose-500/15 text-rose-400 border-rose-500/20'
    case 'high':     return 'bg-orange-500/15 text-orange-400 border-orange-500/20'
    case 'medium':   return 'bg-amber-500/15 text-amber-400 border-amber-500/20'
    case 'low':      return 'bg-slate-500/15 text-slate-400 border-slate-500/20'
    default:         return 'bg-blue-500/15 text-blue-400 border-blue-500/20'
  }
}

function barColor(pct: number) {
  if (pct < 50) return 'bg-emerald-400'
  if (pct < 70) return 'bg-blue-400'
  if (pct < 85) return 'bg-amber-400'
  return 'bg-rose-400'
}

// ── Animation variants ────────────────────────────────────────────────────────

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate()
  const { settings } = useSettingsContext()
  const [health, setHealth] = useState<HealthData | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [apiOnline, setApiOnline] = useState(false)

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: settings.timezone,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      try {
        const [hRes, aRes] = await Promise.all([
          apiFetch('/api/health'),
          apiFetch('/api/activity'),
        ])
        if (cancelled) return
        if (hRes.ok) { setHealth(await hRes.json()); setApiOnline(true) }
        if (aRes.ok) setActivity(await aRes.json())
      } catch {
        if (!cancelled) setApiOnline(false)
      }
    }

    fetchAll()
    const id = setInterval(fetchAll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const metrics = [
    {
      label: 'Scans Run',
      value: health ? String(health.totalScansRun) : '—',
      sub: health ? `${health.activeScans.length} active` : 'API offline',
      color: 'blue' as const,
      Icon: ScanSearch,
    },
    {
      label: 'CPU Usage',
      value: health ? `${health.cpu}%` : '—',
      sub: health ? (health.cpu < 50 ? 'Normal' : health.cpu < 80 ? 'Elevated' : 'High') : '—',
      color: health && health.cpu >= 80 ? 'red' as const : health && health.cpu >= 50 ? 'amber' as const : 'green' as const,
      Icon: Cpu,
    },
    {
      label: 'Memory',
      value: health ? `${health.memory}%` : '—',
      sub: health ? (health.memory < 70 ? 'Normal' : 'Elevated') : '—',
      color: health && health.memory >= 80 ? 'red' as const : 'amber' as const,
      Icon: MemoryStick,
    },
    {
      label: 'API Uptime',
      value: health ? formatUptime(health.uptimeSeconds) : '—',
      sub: apiOnline ? 'Online' : 'Offline',
      color: apiOnline ? 'green' as const : 'red' as const,
      Icon: Clock,
    },
  ]

  const metricColors = {
    blue:  { bg: 'bg-blue-500/10',    icon: 'text-blue-400',    sub: 'text-blue-400' },
    red:   { bg: 'bg-rose-500/10',    icon: 'text-rose-400',    sub: 'text-rose-400' },
    green: { bg: 'bg-emerald-500/10', icon: 'text-emerald-400', sub: 'text-emerald-400' },
    amber: { bg: 'bg-amber-500/10',   icon: 'text-amber-400',   sub: 'text-amber-400' },
  }

  return (
    <div className="min-h-full p-6 space-y-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
            {greeting}, <span className="text-gradient-blue">{settings.orgName || 'Operator'}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{dateStr}</p>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-[12px] text-slate-500 font-mono uppercase tracking-wider">API Server</div>
          <div className={clsx('text-sm font-semibold flex items-center justify-end gap-1.5 mt-0.5', apiOnline ? 'text-emerald-400' : 'text-slate-600')}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', apiOnline ? 'bg-emerald-400 animate-status-ping' : 'bg-slate-600')} />
            {apiOnline ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </motion.div>

      {/* Metrics */}
      <motion.div variants={container} initial="hidden" animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const c = metricColors[m.color]
          return (
            <motion.div key={m.label} variants={item} className="card-surface p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">{m.label}</span>
                <div className={clsx('p-1.5 rounded-md', c.bg)}>
                  <m.Icon size={14} className={c.icon} />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-100 tracking-tight font-mono">{m.value}</div>
                <div className={clsx('text-[12px] mt-0.5', c.sub)}>{m.sub}</div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Activity feed */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
          className="xl:col-span-3 card-surface flex flex-col overflow-hidden min-h-64">
          <div className="flex items-center justify-between px-4 py-3 border-b border-wire-1">
            <h2 className="text-sm font-semibold text-slate-200">Recent Activity</h2>
            {activity.length > 0 && (
              <span className="text-[11px] text-slate-600 font-mono">{activity.length} event{activity.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-wire-1">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
                <Activity size={24} className="text-slate-700" />
                <p className="text-[13px] text-slate-600">No activity yet.</p>
                <p className="text-[12px] text-slate-700">Run a scan to see results here.</p>
              </div>
            ) : (
              activity.map((a, i) => (
                <motion.div key={a.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-wire-1 transition-colors duration-100">
                  <div className="mt-0.5">{activityIcon(a.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-slate-300 leading-snug">{a.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-slate-600">{a.tool}</span>
                      <span className="text-[11px] text-slate-700">·</span>
                      <span className="text-[11px] text-slate-600">{timeAgo(a.timestamp)}</span>
                    </div>
                  </div>
                  <span className={clsx('flex-shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border tracking-wider', severityBadge(a.severity))}>
                    {a.severity}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* Right column */}
        <div className="xl:col-span-2 flex flex-col gap-4">

          {/* System health */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
            className="card-surface">
            <div className="px-4 py-3 border-b border-wire-1">
              <h2 className="text-sm font-semibold text-slate-200">System Health</h2>
            </div>
            <div className="p-4 space-y-3">
              {health ? (
                <>
                  {[
                    { label: 'CPU Usage', value: health.cpu, Icon: Cpu },
                    { label: 'Memory', value: health.memory, Icon: MemoryStick },
                  ].map(({ label, value, Icon }, i) => (
                    <div key={label} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon size={13} className="text-slate-500" />
                          <span className="text-[12px] text-slate-400">{label}</span>
                        </div>
                        <span className="text-[12px] font-mono font-medium text-slate-300">{value}%</span>
                      </div>
                      <div className="h-1.5 bg-wire-2 rounded-full overflow-hidden">
                        <motion.div
                          className={clsx('h-full rounded-full', barColor(value))}
                          initial={{ width: 0 }}
                          animate={{ width: `${value}%` }}
                          transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-wire-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server size={13} className="text-slate-500" />
                        <span className="text-[12px] text-slate-400">Disk / Network</span>
                      </div>
                      <span className="text-[11px] text-slate-700">Not monitored</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-6 flex flex-col items-center gap-2 text-center">
                  <Server size={20} className="text-slate-700" />
                  <p className="text-[12px] text-slate-600">API server offline</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Active operations */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }}
            className="card-surface">
            <div className="px-4 py-3 border-b border-wire-1">
              <h2 className="text-sm font-semibold text-slate-200">Active Operations</h2>
            </div>

            {health && health.activeScans.length > 0 ? (
              <div className="divide-y divide-wire-1">
                {health.activeScans.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-status-ping flex-shrink-0" />
                      <div>
                        <div className="text-[13px] text-slate-300">{s.name}</div>
                        <div className="text-[11px] font-mono text-slate-600 truncate max-w-40">{s.target}</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-600">{formatUptime(s.elapsedSeconds)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <ArrowUpRight size={20} className="text-slate-700" />
                <p className="text-[12px] text-slate-600">No active operations.</p>
                <p className="text-[11px] text-slate-700">Start a scan to see it here.</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Quick Launch */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}
        className="card-surface">
        <div className="px-4 py-3 border-b border-wire-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Quick Launch</h2>
          <div className="flex items-center gap-3 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-500/50" />Red Team</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-500/50" />Blue Team</span>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {allTools.map((tool, i) => {
            const Icon = tool.icon
            const isRed = tool.team === 'red'
            return (
              <motion.button key={tool.id} onClick={() => navigate(tool.path)}
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: 0.35 + i * 0.03 }}
                whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
                className={clsx(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-150 cursor-pointer',
                  isRed
                    ? 'bg-rose-500/5 border-rose-500/15 hover:bg-rose-500/10 hover:border-rose-500/30'
                    : 'bg-blue-500/5 border-blue-500/15 hover:bg-blue-500/10 hover:border-blue-500/30',
                )}>
                <Icon size={18} className={isRed ? 'text-rose-400' : 'text-blue-400'} />
                <span className="text-[11px] text-slate-400 text-center leading-tight font-medium">{tool.name}</span>
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
