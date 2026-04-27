import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import {
  User, Mail, Phone, MapPin, Clock, Pencil, Check, X,
  Shield, Key, Activity, Scan, ChevronRight,
  Globe, Calendar, Fingerprint, Zap, Camera, Trash2,
} from 'lucide-react'
import { useProfileContext } from '../context/ProfileContext'
import { useSettingsContext } from '../context/SettingsContext'
import { getInitials, STATUS_CONFIG, AVATAR_COLORS } from '../hooks/useProfile'
import type { UserStatus } from '../hooks/useProfile'
import { useNavigate } from 'react-router-dom'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthData {
  totalScansRun: number
  uptimeSeconds: number
  activeScans: { name: string; target: string }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUptime(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60) % 60
  const h = Math.floor(s / 3600)
  const d = Math.floor(s / 86400)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  name, color, avatarUrl, size = 80, editable = false, onUpload, onRemove,
}: {
  name: string; color: string; avatarUrl?: string; size?: number
  editable?: boolean; onUpload?: (url: string) => void; onRemove?: () => void
}) {
  const initials = getInitials(name)
  const fileRef = useRef<HTMLInputElement>(null)
  const [hover, setHover] = useState(false)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') onUpload?.(ev.target.result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="relative flex-shrink-0 select-none" style={{ width: size, height: size }}>
      <div
        className="rounded-full overflow-hidden flex items-center justify-center font-bold text-white ring-4 ring-wire-2 w-full h-full"
        style={{ background: avatarUrl ? undefined : color, fontSize: size * 0.32 }}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
          : initials}
      </div>

      {editable && (
        <>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <button
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-full flex items-center justify-center transition-all duration-200"
            style={{ background: hover ? 'rgba(0,0,0,0.55)' : 'transparent' }}
            aria-label="Upload photo"
          >
            {hover && <Camera size={size * 0.28} className="text-white drop-shadow" />}
          </button>
          {avatarUrl && (
            <button
              onClick={onRemove}
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-rose-500 hover:bg-rose-400 flex items-center justify-center border-2 border-surface-1 transition-colors"
              aria-label="Remove photo"
            >
              <Trash2 size={9} className="text-white" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Editable field ────────────────────────────────────────────────────────────

function EditableField({
  label, value, onChange, placeholder, multiline = false, icon: Icon,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  icon?: React.ElementType
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() { onChange(draft); setEditing(false) }
  function cancel() { setDraft(value); setEditing(false) }

  return (
    <div className="group">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={11} className="text-slate-600" />}
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">{label}</span>
      </div>
      {editing ? (
        <div className="flex gap-2 items-start">
          {multiline ? (
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') cancel() }}
              rows={3}
              placeholder={placeholder}
              className="flex-1 bg-wire-1 border border-blue-500/40 rounded-md px-3 py-2 text-[13px] text-slate-300 placeholder:text-slate-600 outline-none resize-none"
            />
          ) : (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
              placeholder={placeholder}
              className="flex-1 bg-wire-1 border border-blue-500/40 rounded-md px-3 py-1.5 text-[13px] text-slate-300 placeholder:text-slate-600 outline-none"
            />
          )}
          <button onClick={commit} className="p-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-400 transition-colors flex-shrink-0">
            <Check size={13} />
          </button>
          <button onClick={cancel} className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-wire-2 transition-colors flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button onClick={() => { setDraft(value); setEditing(true) }}
          className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-wire-1 hover:bg-wire-2 border border-wire-2 hover:border-wire-3 transition-all group/field">
          <span className={clsx('text-[13px]', value ? 'text-slate-300' : 'text-slate-700')}>
            {value || placeholder || 'Not set'}
          </span>
          <Pencil size={11} className="text-slate-700 group-hover/field:text-slate-500 flex-shrink-0 transition-colors" />
        </button>
      )}
    </div>
  )
}

// ── Status picker ─────────────────────────────────────────────────────────────

function StatusPicker({ value, onChange }: { value: UserStatus; onChange: (s: UserStatus) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[value]

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-wire-1 border border-wire-2 hover:border-wire-3 transition-all text-[13px]">
        <span className={clsx('h-2 w-2 rounded-full flex-shrink-0', cfg.dot)} />
        <span className={clsx('font-medium', cfg.color)}>{cfg.label}</span>
        <ChevronRight size={12} className={clsx('text-slate-600 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 card-surface-elevated w-44 overflow-hidden shadow-xl">
            {(Object.entries(STATUS_CONFIG) as [UserStatus, typeof STATUS_CONFIG[UserStatus]][]).map(([key, s]) => (
              <button key={key} onClick={() => { onChange(key); setOpen(false) }}
                className={clsx('w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-wire-2 transition-colors',
                  value === key ? 'bg-wire-2' : '')}>
                <span className={clsx('h-2 w-2 rounded-full flex-shrink-0', s.dot)} />
                <span className={clsx('font-medium', s.color)}>{s.label}</span>
                {value === key && <Check size={11} className="ml-auto text-slate-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Color picker ──────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {AVATAR_COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)}
          className="h-7 w-7 rounded-full border-2 transition-all hover:scale-110"
          style={{ backgroundColor: c, borderColor: value === c ? '#fff' : 'transparent' }}
        />
      ))}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = 'blue' }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color?: string
}) {
  const colors: Record<string, string> = {
    blue:  'text-blue-400 bg-blue-500/10',
    green: 'text-emerald-400 bg-emerald-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    rose:  'text-rose-400 bg-rose-500/10',
  }
  return (
    <div className="card-surface p-4 flex flex-col gap-2">
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', colors[color])}>
        <Icon size={15} className={colors[color].split(' ')[0]} />
      </div>
      <div>
        <div className="text-xl font-bold font-mono text-slate-100 tracking-tight">{value}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
        {sub && <div className="text-[11px] text-slate-700 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ── Activity entry ────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string; type: string; severity: string; message: string; tool: string; timestamp: string
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const sevColor: Record<string, string> = {
  critical: 'text-rose-400',
  high:     'text-orange-400',
  medium:   'text-amber-400',
  low:      'text-slate-400',
  info:     'text-blue-400',
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function Profile() {
  const { profile, update } = useProfileContext()
  const { settings } = useSettingsContext()
  const navigate = useNavigate()

  const [health, setHealth] = useState<HealthData | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/activity').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([h, a]) => {
      if (h) setHealth(h)
      setActivity(a)
    })
  }, [])

  const statusCfg = STATUS_CONFIG[profile.status]

  return (
    <div className="min-h-full p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your identity and preferences</p>
        </div>
        <button onClick={() => navigate('/settings')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-slate-400 border border-wire-2 hover:border-wire-3 hover:text-slate-200 transition-all">
          Settings <ChevronRight size={12} />
        </button>
      </motion.div>

      {/* Top card — identity */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="card-surface p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Avatar + color */}
          <div className="flex flex-col items-center gap-4 flex-shrink-0">
            <div className="relative">
              <Avatar
                name={profile.displayName}
                color={profile.avatarColor}
                avatarUrl={profile.avatarUrl}
                size={88}
                editable
                onUpload={url => update('avatarUrl', url)}
                onRemove={() => update('avatarUrl', '')}
              />
              <div className={clsx(
                'absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-surface-2',
                statusCfg.dot,
              )} />
            </div>
            {!profile.avatarUrl && (
              <div className="space-y-2 w-full">
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider text-center">Avatar color</div>
                <ColorPicker value={profile.avatarColor} onChange={c => update('avatarColor', c)} />
              </div>
            )}
            <p className="text-[11px] text-slate-600 text-center">Click avatar to upload photo</p>
          </div>

          {/* Core identity */}
          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EditableField label="Display Name" value={profile.displayName} onChange={v => update('displayName', v)}
              placeholder="Your name" icon={User} />
            <EditableField label="Handle" value={profile.handle} onChange={v => update('handle', v.replace(/\s/g, '').toLowerCase())}
              placeholder="@handle" icon={Fingerprint} />
            <EditableField label="Title / Role" value={profile.title} onChange={v => update('title', v)}
              placeholder="Security Analyst" icon={Shield} />
            <EditableField label="Location" value={profile.location} onChange={v => update('location', v)}
              placeholder="City, Country" icon={MapPin} />
            <div className="sm:col-span-2">
              <EditableField label="Bio" value={profile.bio} onChange={v => update('bio', v)}
                placeholder="A short description about yourself…" multiline icon={User} />
            </div>
          </div>
        </div>

        {/* Status row */}
        <div className="mt-5 pt-5 border-t border-wire-1 flex flex-wrap items-center gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Status</div>
            <StatusPicker value={profile.status} onChange={s => update('status', s)} />
          </div>
          <div className="flex-1" />
          <div className="text-right">
            <div className="text-[11px] text-slate-600 uppercase tracking-wider">Member since</div>
            <div className="text-[13px] text-slate-400 mt-0.5 flex items-center gap-1.5 justify-end">
              <Calendar size={12} className="text-slate-600" />
              {formatDate(profile.joinedAt)}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Left col — contact + security */}
        <div className="lg:col-span-2 space-y-4">

          {/* Contact */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="card-surface overflow-hidden">
            <div className="px-5 py-3.5 border-b border-wire-1">
              <h3 className="text-sm font-semibold text-slate-200">Contact</h3>
            </div>
            <div className="p-5 space-y-4">
              <EditableField label="Email" value={profile.email} onChange={v => update('email', v)}
                placeholder="you@example.com" icon={Mail} />
              <EditableField label="Phone" value={profile.phone} onChange={v => update('phone', v)}
                placeholder="+1 555 000 0000" icon={Phone} />
              <EditableField label="Timezone" value={profile.timezone} onChange={v => update('timezone', v)}
                placeholder="UTC" icon={Globe} />
            </div>
          </motion.div>

          {/* Security */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
            className="card-surface overflow-hidden">
            <div className="px-5 py-3.5 border-b border-wire-1">
              <h3 className="text-sm font-semibold text-slate-200">Security</h3>
            </div>
            <div className="divide-y divide-wire-1">
              {[
                {
                  label: '2-Factor Authentication',
                  value: settings.twoFactor ? 'Enabled' : 'Disabled',
                  color: settings.twoFactor ? 'text-emerald-400' : 'text-rose-400',
                  icon: Shield,
                },
                {
                  label: 'API Access',
                  value: settings.apiAccess ? 'Enabled' : 'Disabled',
                  color: settings.apiAccess ? 'text-emerald-400' : 'text-slate-500',
                  icon: Key,
                },
                {
                  label: 'Session Timeout',
                  value: { '15m': '15 min', '30m': '30 min', '1h': '1 hour', '4h': '4 hours', 'never': 'Never' }[settings.sessionTimeout],
                  color: 'text-slate-400',
                  icon: Clock,
                },
                {
                  label: 'Audit Logging',
                  value: settings.auditLog ? 'Active' : 'Off',
                  color: settings.auditLog ? 'text-emerald-400' : 'text-slate-500',
                  icon: Activity,
                },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <row.icon size={13} className="text-slate-600 flex-shrink-0" />
                    <span className="text-[13px] text-slate-400">{row.label}</span>
                  </div>
                  <span className={clsx('text-[12px] font-medium', row.color)}>{row.value}</span>
                </div>
              ))}
              <div className="px-5 py-3">
                <button onClick={() => navigate('/settings')}
                  className="text-[12px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
                  Manage in Settings <ChevronRight size={11} />
                </button>
              </div>
            </div>
          </motion.div>

        </div>

        {/* Right col — stats + activity */}
        <div className="lg:col-span-3 space-y-4">

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Scans this session" value={health ? String(health.totalScansRun) : '—'}
                icon={Scan} color="blue" />
              <StatCard label="Session uptime" value={health ? formatUptime(health.uptimeSeconds) : '—'}
                icon={Zap} color="green" />
              <StatCard label="Active scans" value={health ? String(health.activeScans.length) : '—'}
                sub={health?.activeScans[0]?.target}
                icon={Activity} color={health && health.activeScans.length > 0 ? 'amber' : 'blue'} />
            </div>
          </motion.div>

          {/* Recent activity */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
            className="card-surface overflow-hidden">
            <div className="px-5 py-3.5 border-b border-wire-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Recent Activity</h3>
              {activity.length > 0 && (
                <span className="text-[11px] text-slate-600">{activity.length} events</span>
              )}
            </div>
            <div className="divide-y divide-wire-1 max-h-72 overflow-y-auto">
              {activity.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-center">
                  <Activity size={22} className="text-slate-700" />
                  <p className="text-[13px] text-slate-600">No activity yet — run a scan to populate this.</p>
                </div>
              ) : (
                activity.map(a => (
                  <div key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-wire-1 transition-colors">
                    <div className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5', {
                      'bg-rose-400': a.severity === 'critical',
                      'bg-orange-400': a.severity === 'high',
                      'bg-amber-400': a.severity === 'medium',
                      'bg-slate-500': a.severity === 'low',
                      'bg-blue-400': a.severity === 'info',
                    })} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-slate-300 leading-snug">{a.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-slate-600">{a.tool}</span>
                        <span className="text-slate-700">·</span>
                        <span className="text-[11px] text-slate-600">{timeAgo(a.timestamp)}</span>
                      </div>
                    </div>
                    <span className={clsx('text-[10px] font-semibold uppercase tracking-wider flex-shrink-0', sevColor[a.severity] ?? 'text-slate-500')}>
                      {a.severity}
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          {/* Platform info */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
            className="card-surface overflow-hidden">
            <div className="px-5 py-3.5 border-b border-wire-1">
              <h3 className="text-sm font-semibold text-slate-200">Platform</h3>
            </div>
            <div className="divide-y divide-wire-1">
              {[
                { label: 'Organization', value: settings.orgName || '—' },
                { label: 'Theme',        value: { midnight: 'Midnight', phosphor: 'Phosphor', obsidian: 'Obsidian', graphite: 'Graphite' }[settings.theme] },
                { label: 'Timezone',     value: settings.timezone },
                { label: 'API Keys set', value: String(Object.values(settings.apiKeys).filter(Boolean).length) + ' / ' + Object.keys(settings.apiKeys).length },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-[13px] text-slate-500">{row.label}</span>
                  <span className="text-[13px] text-slate-300 font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  )
}
