import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  Eye, Shield, ShieldOff, AlertTriangle, X, RefreshCw, Filter,
  ArrowUpRight, Globe, Activity, Clock, Target, CheckCircle2,
  Radio, WifiOff, Database, ShieldCheck,
} from 'lucide-react'
import type { ThreatEntry } from '../../types'

interface DataSources {
  blocklist: boolean
  blocklistSize: number
  netstat: boolean
  eventLog: boolean
}

// ── Config ────────────────────────────────────────────────────────────────────

const SEV = {
  critical: { badge: 'text-rose-400 bg-rose-500/10 border-rose-500/30', row: 'border-l-rose-500/60', dot: 'bg-rose-400', label: 'Critical' },
  high:     { badge: 'text-orange-400 bg-orange-500/10 border-orange-500/30', row: 'border-l-orange-500/50', dot: 'bg-orange-400', label: 'High' },
  medium:   { badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30', row: 'border-l-amber-500/40', dot: 'bg-amber-400', label: 'Medium' },
  low:      { badge: 'text-slate-400 bg-slate-500/10 border-slate-500/20', row: 'border-l-slate-500/30', dot: 'bg-slate-500', label: 'Low' },
}

const STATUS_CFG: Record<ThreatEntry['status'], string> = {
  active:        'text-rose-400 bg-rose-500/10 border-rose-500/20',
  blocked:       'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  monitoring:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  investigating: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  resolved:      'text-slate-500 bg-wire-1 border-wire-2',
}

const RISK_COLOR: Record<string, string> = {
  Low: 'text-emerald-400', Medium: 'text-amber-400', High: 'text-orange-400', Critical: 'text-rose-400',
}

function timeAgo(iso?: string, legacy?: string) {
  if (!iso) return legacy ?? '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Threat row ────────────────────────────────────────────────────────────────

function ThreatRow({ threat, selected, onSelect, isNew, index }: {
  threat: ThreatEntry; selected: boolean; onSelect: () => void; isNew: boolean; index: number
}) {
  const sc = SEV[threat.severity]
  return (
    <motion.button
      onClick={onSelect}
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: isNew ? 0 : index * 0.03, duration: 0.2 }}
      className={clsx(
        'w-full text-left flex items-center gap-4 px-4 py-3 border-b border-wire-1 last:border-0',
        'border-l-2 transition-colors duration-150 relative overflow-hidden',
        sc.row,
        selected ? 'bg-wire-2' : 'hover:bg-wire-1',
      )}
    >
      {/* New-threat flash overlay */}
      {isNew && (
        <motion.div
          className="absolute inset-0 bg-rose-500/12 pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 3 }}
        />
      )}

      <span className={clsx(
        'h-2 w-2 rounded-full flex-shrink-0',
        sc.dot,
        threat.severity === 'critical' && threat.status === 'active' && 'animate-status-ping',
      )} />

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-slate-200 truncate">{threat.type}</span>
          {isNew && <span className="flex-shrink-0 text-[9px] font-bold tracking-widest text-rose-400 uppercase bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">NEW</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <span className="font-mono truncate max-w-[100px]">{threat.source}</span>
          <ArrowUpRight size={9} className="text-slate-700 flex-shrink-0" />
          <span className="font-mono truncate max-w-[120px]">{threat.target}</span>
          {threat.protocol && <span className="text-slate-700 hidden sm:inline">· {threat.protocol}</span>}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className={clsx('text-[11px] font-medium px-1.5 py-0.5 rounded border', STATUS_CFG[threat.status])}>
          {threat.status}
        </span>
        <span className="text-[10px] text-slate-700">{timeAgo(threat.timestamp, threat.time)}</span>
      </div>
    </motion.button>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function ThreatDetail({ threat, onClose, onStatusChange }: {
  threat: ThreatEntry; onClose: () => void; onStatusChange: (id: string, status: ThreatEntry['status']) => void
}) {
  const sc = SEV[threat.severity]
  const [busy, setBusy] = useState<string | null>(null)

  async function act(status: ThreatEntry['status']) {
    setBusy(status)
    try {
      const r = await fetch(`/api/threats/${threat.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (r.ok) onStatusChange(threat.id, status)
    } finally {
      setBusy(null)
    }
  }

  const rep = threat.reputation
  const geo = threat.geo

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22 }}
      className="card-surface flex flex-col h-full"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-wire-1">
        <h3 className="text-sm font-semibold text-slate-200">Alert Detail</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-wire-2 text-slate-500 hover:text-slate-300 transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Type + badges */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border', sc.badge)}>
              {sc.label}
            </span>
            <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded border', STATUS_CFG[threat.status])}>
              {threat.status}
            </span>
            {threat.protocol && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-wire-1 text-slate-500 border border-wire-2">
                {threat.protocol}
              </span>
            )}
          </div>
          <h4 className="text-base font-semibold text-slate-100">{threat.type}</h4>
        </div>

        {/* Connection */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Connection</div>
          <div className="bg-wire-1 rounded-md p-3 font-mono text-[12px] space-y-1.5">
            <div className="flex gap-3">
              <span className="text-slate-600 w-20 flex-shrink-0">Source</span>
              <span className="text-rose-300 truncate">{threat.source}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-600 w-20 flex-shrink-0">Target</span>
              <span className="text-blue-300 truncate">{threat.target}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-600 w-20 flex-shrink-0">Detected</span>
              <span className="text-slate-400">{timeAgo(threat.timestamp, threat.time)}</span>
            </div>
          </div>
        </div>

        {/* Source + notes */}
        {(threat.source_label || threat.notes) && (
          <div className="space-y-1.5 bg-wire-1 rounded-md px-3 py-2.5 border border-wire-2">
            {threat.source_label && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Database size={10} className="text-slate-600" />
                <span className="text-slate-600">Source:</span>
                <span className="text-emerald-400 font-medium">{threat.source_label}</span>
              </div>
            )}
            {threat.notes && (
              <div className="text-[11px] text-slate-500 font-mono">{threat.notes}</div>
            )}
          </div>
        )}

        {/* MITRE ATT&CK */}
        {threat.mitre && threat.mitre.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">MITRE ATT&CK</div>
            <div className="flex flex-wrap gap-1.5">
              {threat.mitre.map(t => (
                <span key={t} className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-wire-3">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Geolocation */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Geolocation</div>
          {geo ? (
            <div className="bg-wire-1 rounded-md p-3 text-[12px] space-y-1.5">
              <div className="flex items-center gap-2">
                <Globe size={12} className="text-slate-600 flex-shrink-0" />
                <span className="text-slate-300">{geo.city}, {geo.country}</span>
                <span className={clsx('ml-auto text-[10px] font-semibold uppercase tracking-wider', RISK_COLOR[geo.risk] ?? 'text-slate-500')}>
                  {geo.risk} risk
                </span>
              </div>
              <div className="text-slate-600 font-mono">{geo.asn} · {geo.asnName}</div>
            </div>
          ) : (
            <span className="text-[13px] text-slate-600">Unknown</span>
          )}
        </div>

        {/* IP Reputation */}
        {rep && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">IP Reputation</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Threat Score</span>
                <span className={clsx('text-[12px] font-mono font-bold',
                  rep.score >= 85 ? 'text-rose-400' : rep.score >= 65 ? 'text-amber-400' : 'text-emerald-400'
                )}>{rep.score} / 100</span>
              </div>
              <div className="h-1.5 bg-wire-2 rounded-full overflow-hidden">
                <motion.div
                  className={clsx('h-full rounded-full', rep.score >= 85 ? 'bg-rose-400' : rep.score >= 65 ? 'bg-amber-400' : 'bg-emerald-400')}
                  initial={{ width: 0 }}
                  animate={{ width: `${rep.score}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {[
                  { label: 'TOR exit node',  val: rep.tor },
                  { label: 'Malware C2',     val: rep.malware },
                  { label: 'Known scanner',  val: rep.scanner },
                  { label: 'Open proxy',     val: rep.proxy },
                  { label: 'Botnet member',  val: rep.botnet },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-1.5 text-[11px]">
                    <span className={clsx('h-1.5 w-1.5 rounded-full', r.val ? 'bg-rose-400' : 'bg-slate-700')} />
                    <span className={r.val ? 'text-slate-400' : 'text-slate-700'}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 border-t border-wire-1 p-4 space-y-2">
        {threat.status !== 'blocked' && (
          <button
            onClick={() => act('blocked')}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {busy === 'blocked' ? <RefreshCw size={13} className="animate-spin" /> : <Shield size={13} />}
            Block Source IP
          </button>
        )}
        {threat.status !== 'investigating' && threat.status !== 'resolved' && (
          <button
            onClick={() => act('investigating')}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            {busy === 'investigating' ? <RefreshCw size={13} className="animate-spin" /> : <Target size={13} />}
            Open Investigation
          </button>
        )}
        {threat.status !== 'resolved' && (
          <button
            onClick={() => act('resolved')}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium bg-wire-1 text-slate-400 border border-wire-2 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            {busy === 'resolved' ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Mark Resolved
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ThreatMonitor() {
  const [threats, setThreats] = useState<ThreatEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<ThreatEntry | null>(null)
  const [sevFilter, setSevFilter] = useState<ThreatEntry['severity'] | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ThreatEntry['status'] | 'all'>('all')
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [sources, setSources] = useState<DataSources | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Initial load
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/threats')
      if (r.ok) {
        const body = await r.json()
        setThreats(body.threats ?? [])
        setSources(body.dataSources ?? null)
      }
    } finally {
      setLoading(false)
      setLastRefresh(Date.now())
    }
  }, [])

  useEffect(() => { load() }, [load])

  // SSE stream for live threats
  useEffect(() => {
    const es = new EventSource('http://localhost:3001/api/threats/stream')
    eventSourceRef.current = es

    es.addEventListener('threat', (e: MessageEvent) => {
      const t: ThreatEntry = JSON.parse(e.data)
      setThreats(prev => [t, ...prev.filter(x => x.id !== t.id)])
      setNewIds(prev => new Set([...prev, t.id]))
      setTimeout(() => setNewIds(prev => { const s = new Set(prev); s.delete(t.id); return s }), 8000)
    })

    es.addEventListener('threat_update', (e: MessageEvent) => {
      const t: ThreatEntry = JSON.parse(e.data)
      setThreats(prev => prev.map(x => x.id === t.id ? t : x))
    })

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    return () => { es.close(); setConnected(false) }
  }, [])

  // Keep selected threat in sync when status changes
  function handleStatusChange(id: string, status: ThreatEntry['status']) {
    setThreats(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    setSelected(prev => prev?.id === id ? { ...prev, status } : prev)
  }

  const filtered = threats.filter(t => {
    const ms = sevFilter === 'all' || t.severity === sevFilter
    const mt = statusFilter === 'all' || t.status === statusFilter
    return ms && mt
  })

  const criticalCount = threats.filter(t => t.severity === 'critical').length
  const activeCount   = threats.filter(t => t.status === 'active').length
  const blockedCount  = threats.filter(t => t.status === 'blocked').length
  const newCount      = newIds.size

  return (
    <div className="min-h-full p-6 space-y-5">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex-shrink-0">
          <Eye size={22} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Threat Monitor</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-blue-400 bg-blue-500/10 border-blue-500/20">
              Blue Team · Monitoring
            </span>
            <span className={clsx('flex items-center gap-1.5 text-[12px]', connected ? 'text-emerald-400' : 'text-slate-500')}>
              {connected
                ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-status-ping" /> Live</>
                : <><WifiOff size={11} /> Disconnected</>}
            </span>
            {newCount > 0 && (
              <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                +{newCount} new
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Live monitoring via Feodo Tracker C2 blocklist, active network connections, and Windows Security Event Log.
          </p>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {[
          { label: 'Total Threats', value: threats.length, color: 'text-slate-200',  icon: Activity },
          { label: 'Active',        value: activeCount,    color: 'text-rose-400',    icon: AlertTriangle },
          { label: 'Blocked',       value: blockedCount,   color: 'text-emerald-400', icon: Shield },
          { label: 'Critical',      value: criticalCount,  color: 'text-rose-400',    icon: ShieldOff },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
              className="card-surface px-4 py-3 flex items-center gap-3">
              <Icon size={18} className={clsx(s.color, 'flex-shrink-0 opacity-70')} />
              <div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">{s.label}</div>
                <div className={clsx('text-xl font-bold font-mono tracking-tight', s.color)}>{s.value}</div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Feed + detail */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className={clsx('card-surface overflow-hidden flex flex-col', selected ? 'xl:col-span-2' : 'xl:col-span-3')}
        >
          {/* Filters */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-wire-1 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter size={13} className="text-slate-600" />
              <div className="flex gap-1 flex-wrap">
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map(s => (
                  <button key={s} onClick={() => setSevFilter(s)}
                    className={clsx('px-2.5 py-1.5 rounded text-[11px] font-medium capitalize border transition-all duration-150',
                      sevFilter === s ? 'bg-slate-700/50 text-slate-200 border-slate-600' : 'text-slate-500 border-wire-2 hover:text-slate-300')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 flex-wrap">
                {(['all', 'active', 'blocked', 'monitoring', 'investigating'] as const).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={clsx('px-2.5 py-1.5 rounded text-[11px] font-medium capitalize border transition-all duration-150',
                      statusFilter === s ? 'bg-slate-700/50 text-slate-200 border-slate-600' : 'text-slate-500 border-wire-2 hover:text-slate-300')}>
                    {s}
                  </button>
                ))}
              </div>
              <button onClick={load} title="Refresh" className="flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-300 transition-colors p-1.5">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Column heads */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-wire-1 bg-wire-1 pl-6">
            <div className="text-[11px] text-slate-600 uppercase tracking-wider flex-1">Threat / Source → Target</div>
            <div className="text-[11px] text-slate-600 uppercase tracking-wider flex-shrink-0">Status</div>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ maxHeight: '60vh' }}>
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-slate-600">
                <Radio size={16} className="animate-pulse" />
                <span className="text-[13px]">Scanning — checking Feodo Tracker C2 list and Event Log…</span>
              </div>
            ) : filtered.length === 0 && threats.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
                <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <ShieldCheck size={28} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-emerald-400">No threats detected</p>
                  <p className="text-[12px] text-slate-600 mt-1 max-w-sm">
                    No active connections to known C2 servers and no suspicious login events in the last 24 hours.
                    The monitor polls every 30 seconds.
                  </p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Shield size={24} className="text-slate-700" />
                <p className="text-[13px] text-slate-600">No threats match the current filters.</p>
              </div>
            ) : (
              filtered.map((t, i) => (
                <ThreatRow
                  key={t.id}
                  threat={t}
                  index={i}
                  isNew={newIds.has(t.id)}
                  selected={selected?.id === t.id}
                  onSelect={() => setSelected(sel => sel?.id === t.id ? null : t)}
                />
              ))
            )}
          </div>

          {/* Footer — data sources */}
          <div className="px-4 py-2 border-t border-wire-1 flex items-center gap-3 text-[11px] text-slate-700 flex-wrap">
            <Clock size={11} className="flex-shrink-0" />
            <span>Polled {timeAgo(new Date(lastRefresh).toISOString())}</span>
            {sources && (
              <>
                <span className="text-slate-800">·</span>
                <span className="flex items-center gap-1">
                  <Database size={10} />
                  <span className={sources.blocklist ? 'text-emerald-600' : 'text-slate-700'}>
                    Feodo Tracker {sources.blocklist ? `(${sources.blocklistSize.toLocaleString()} C2 IPs)` : '(offline)'}
                  </span>
                </span>
                <span className="text-slate-800">·</span>
                <span className={sources.eventLog ? 'text-emerald-600' : 'text-slate-700'}>
                  {sources.eventLog ? 'Event Log ✓' : 'Event Log (admin required)'}
                </span>
              </>
            )}
            <span className="ml-auto">{filtered.length} / {threats.length} shown</span>
          </div>
        </motion.div>

        {/* Detail panel */}
        <AnimatePresence>
          {selected && (
            <div className="xl:col-span-1">
              <ThreatDetail
                threat={selected}
                onClose={() => setSelected(null)}
                onStatusChange={handleStatusChange}
              />
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
