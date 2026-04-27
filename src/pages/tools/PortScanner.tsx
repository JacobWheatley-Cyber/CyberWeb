import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  Scan, Play, Square, Download, Search, AlertCircle, Loader2,
  ChevronDown, ChevronRight, Shield, ShieldAlert, Info,
  Copy, Check, X, AlertTriangle, Zap, Lock,
} from 'lucide-react'
import { SavedTargets } from '../../components/SavedTargets'

// ── Types ─────────────────────────────────────────────────────────────────────

type PortStatus = 'open' | 'closed' | 'filtered'
type Risk = 'critical' | 'high' | 'medium' | 'low' | 'none'

interface MitreTechnique {
  id: string
  name: string
  desc: string
}

interface PortResult {
  port: number
  status: PortStatus
  service: string
  banner: string
  risk: Risk
  mitre: MitreTechnique[]
  recommendations: string[]
}

interface ScanMeta {
  target: string
  ip: string
  hostname: string
  totalPorts: number
}

interface ScanSummary {
  open: number
  closed: number
  filtered: number
  total: number
}

// ── Risk config ───────────────────────────────────────────────────────────────

const RISK_CFG: Record<Risk, { label: string; badge: string; row: string; dot: string; icon: typeof ShieldAlert }> = {
  critical: { label: 'Critical', badge: 'text-rose-400 bg-rose-500/10 border-rose-500/30',   row: 'bg-rose-500/5 border-l-rose-500',   dot: 'bg-rose-400',    icon: ShieldAlert },
  high:     { label: 'High',     badge: 'text-orange-400 bg-orange-500/10 border-orange-500/30', row: 'bg-orange-500/5 border-l-orange-500', dot: 'bg-orange-400', icon: AlertTriangle },
  medium:   { label: 'Medium',   badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30',  row: 'bg-amber-500/5 border-l-amber-500',   dot: 'bg-amber-400',   icon: AlertCircle },
  low:      { label: 'Low',      badge: 'text-blue-400 bg-blue-500/10 border-blue-500/20',    row: 'bg-blue-500/5 border-l-blue-400',     dot: 'bg-blue-400',    icon: Info },
  none:     { label: '—',        badge: 'text-slate-600 bg-wire-1 border-wire-2',              row: '',                                    dot: 'bg-slate-700',   icon: Info },
}

const STATUS_CFG: Record<PortStatus, string> = {
  open:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  closed:   'text-slate-600 bg-wire-1 border-wire-2',
  filtered: 'text-amber-500 bg-amber-500/8 border-amber-500/20',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function overallRisk(ports: PortResult[]): Risk {
  const open = ports.filter(p => p.status === 'open')
  if (open.some(p => p.risk === 'critical')) return 'critical'
  if (open.some(p => p.risk === 'high')) return 'high'
  if (open.some(p => p.risk === 'medium')) return 'medium'
  if (open.length > 0) return 'low'
  return 'none'
}

function exportJson(meta: ScanMeta | null, ports: PortResult[]) {
  const blob = new Blob([JSON.stringify({ meta, ports }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `portscan-${meta?.target ?? 'result'}.json`
  a.click()
}

function exportCsv(meta: ScanMeta | null, ports: PortResult[]) {
  const rows = [
    'Port,Status,Service,Risk,Banner',
    ...ports.map(p => [p.port, p.status, p.service, p.risk, `"${p.banner.replace(/"/g, "'").replace(/\n/g, ' ')}"`].join(',')),
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `portscan-${meta?.target ?? 'result'}.csv`
  a.click()
}

function exportText(meta: ScanMeta | null, ports: PortResult[]) {
  const lines = [
    `CyberWeb Port Scanner — ${new Date().toISOString()}`,
    `Target : ${meta?.target}  (${meta?.ip})`,
    `Host   : ${meta?.hostname || '—'}`,
    `Ports  : ${meta?.totalPorts} scanned`,
    '',
    'PORT      STATE      SERVICE         RISK',
    '─'.repeat(56),
    ...ports
      .filter(p => p.status === 'open')
      .map(p => `${String(p.port).padEnd(10)}${p.status.padEnd(11)}${(p.service || '?').padEnd(16)}${p.risk}`),
    '',
    '── Closed / Filtered ──',
    ...ports.filter(p => p.status !== 'open').map(p => `${String(p.port).padEnd(10)}${p.status}`),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `portscan-${meta?.target ?? 'result'}.txt`
  a.click()
}

// ── Port detail panel ─────────────────────────────────────────────────────────

function PortDetail({ port, onClose }: { port: PortResult; onClose: () => void }) {
  const rc = RISK_CFG[port.risk]
  const [copied, setCopied] = useState(false)

  function copyBanner() {
    navigator.clipboard.writeText(port.banner)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <motion.div
      key={port.port}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2 }}
      className="card-surface flex flex-col overflow-hidden"
      style={{ maxHeight: '80vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-wire-1 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[15px] font-bold text-slate-100">{port.port}</span>
          <span className="text-slate-600">/tcp</span>
          {port.service && <span className="text-[12px] text-slate-400">{port.service}</span>}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-wire-2 text-slate-600 hover:text-slate-300 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* State + risk */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded border uppercase tracking-wider', STATUS_CFG[port.status])}>
            {port.status}
          </span>
          {port.risk !== 'none' && (
            <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider', rc.badge)}>
              {rc.label} risk
            </span>
          )}
        </div>

        {/* Banner */}
        {port.banner && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Service Banner</div>
              <button onClick={copyBanner} className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-400 transition-colors">
                {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="bg-surface-0 border border-wire-2 rounded-md p-3 text-[11px] font-mono text-slate-400 whitespace-pre-wrap break-all leading-relaxed">
              {port.banner}
            </pre>
          </div>
        )}

        {/* MITRE ATT&CK */}
        {port.mitre.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">MITRE ATT&amp;CK</div>
            <div className="space-y-2">
              {port.mitre.map(t => (
                <div key={t.id} className="rounded-md border border-wire-2 bg-surface-0 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                      {t.id}
                    </span>
                    <span className="text-[12px] font-medium text-slate-300">{t.name}</span>
                  </div>
                  <p className="text-[12px] text-slate-500 leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {port.recommendations.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Lock size={10} /> Security Recommendations
            </div>
            <ul className="space-y-1.5">
              {port.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-slate-400">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500/60 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {port.risk === 'none' && port.status !== 'open' && (
          <p className="text-[12px] text-slate-700 italic">No additional details for {port.status} ports.</p>
        )}
      </div>
    </motion.div>
  )
}

// ── Port row ──────────────────────────────────────────────────────────────────

function PortRow({ port, selected, onSelect, isNew }: {
  port: PortResult; selected: boolean; onSelect: () => void; isNew: boolean
}) {
  const rc = RISK_CFG[port.risk]
  const isOpen = port.status === 'open'

  return (
    <motion.button
      onClick={onSelect}
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={clsx(
        'w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-wire-1 last:border-0 transition-colors duration-100 relative overflow-hidden',
        isOpen ? `border-l-2 ${rc.row}` : 'border-l-2 border-l-transparent',
        selected ? 'bg-wire-2' : isOpen ? 'hover:bg-wire-1' : 'hover:bg-wire-1/50 opacity-60',
      )}
    >
      {isNew && (
        <motion.div className="absolute inset-0 bg-emerald-500/8 pointer-events-none"
          initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 2 }} />
      )}

      {/* Port */}
      <span className="font-mono text-[13px] text-slate-300 w-14 flex-shrink-0">{port.port}</span>

      {/* Status */}
      <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wider flex-shrink-0 w-16 text-center', STATUS_CFG[port.status])}>
        {port.status}
      </span>

      {/* Service */}
      <span className="flex-1 min-w-0 text-[12px] text-slate-400 truncate">
        {port.service || <span className="text-slate-700">unknown</span>}
      </span>

      {/* Banner preview */}
      <span className="hidden lg:block flex-1 min-w-0 text-[11px] font-mono text-slate-600 truncate max-w-[180px]">
        {port.banner ? port.banner.split('\n')[0].slice(0, 60) : ''}
      </span>

      {/* Risk */}
      {isOpen && port.risk !== 'none' && (
        <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider flex-shrink-0', rc.badge)}>
          {rc.label}
        </span>
      )}

      {isOpen && <ChevronRight size={12} className={clsx('flex-shrink-0 transition-transform', selected && 'rotate-90', 'text-slate-700')} />}
    </motion.button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PRESET_PORT_COUNTS: Record<string, number> = { Quick: 20, Standard: 54, Thorough: 104 }

export function PortScanner() {
  const [target, setTarget]       = useState('')
  const [mode, setMode]           = useState<'Quick' | 'Standard' | 'Thorough' | 'Custom'>('Standard')
  const [customPorts, setCustomPorts] = useState('')
  const [timeoutMs, setTimeoutMs] = useState(1000)
  const [showClosed, setShowClosed] = useState(false)

  const [ports, setPorts]         = useState<PortResult[]>([])
  const [meta, setMeta]           = useState<ScanMeta | null>(null)
  const [summary, setSummary]     = useState<ScanSummary | null>(null)
  const [running, setRunning]     = useState(false)
  const [started, setStarted]     = useState(false)
  const [progress, setProgress]   = useState(0)
  const [scanTime, setScanTime]   = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [selected, setSelected]   = useState<PortResult | null>(null)
  const [filter, setFilter]       = useState('')
  const [newPorts, setNewPorts]   = useState<Set<number>>(new Set())
  const [sortBy, setSortBy]       = useState<'port' | 'risk' | 'status'>('port')

  const esRef        = useRef<EventSource | null>(null)
  const startTimeRef = useRef(0)
  const doneRef      = useRef(false)
  const totalRef     = useRef(0)
  const scannedRef   = useRef(0)

  const RISK_ORDER: Record<Risk, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }

  const filtered = useMemo(() => {
    let list = ports
    if (!showClosed) list = list.filter(p => p.status === 'open')
    if (filter) {
      const q = filter.toLowerCase()
      list = list.filter(p =>
        String(p.port).includes(q) || p.service.toLowerCase().includes(q) ||
        p.status.includes(q) || p.banner.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'risk') return RISK_ORDER[a.risk] - RISK_ORDER[b.risk]
      if (sortBy === 'status') return a.status.localeCompare(b.status)
      return a.port - b.port
    })
  }, [ports, showClosed, filter, sortBy])

  const risk = useMemo(() => overallRisk(ports), [ports])

  function buildPortSpec() {
    if (mode === 'Custom') return customPorts || '1-1024'
    return mode // server maps preset names to port lists
  }

  function startScan() {
    if (!target.trim() || running) return
    esRef.current?.close()
    doneRef.current = false
    scannedRef.current = 0

    setPorts([])
    setMeta(null)
    setSummary(null)
    setStarted(true)
    setRunning(true)
    setProgress(0)
    setScanTime('')
    setError(null)
    setSelected(null)
    setNewPorts(new Set())
    startTimeRef.current = Date.now()

    const params = new URLSearchParams({ target: target.trim(), timeout: String(timeoutMs) })
    if (mode === 'Custom') {
      params.set('ports', customPorts || '1-1024')
    } else {
      params.set('mode', mode)
    }

    const es = new EventSource(`http://localhost:3001/api/port-scan?${params}`)
    esRef.current = es

    es.addEventListener('start', e => {
      const d: ScanMeta = JSON.parse((e as MessageEvent).data)
      setMeta(d)
      totalRef.current = d.totalPorts
    })

    es.addEventListener('port', e => {
      const p: PortResult = JSON.parse((e as MessageEvent).data)
      scannedRef.current++
      setProgress(Math.round((scannedRef.current / (totalRef.current || 1)) * 100))
      if (p.status === 'open' || showClosed) {
        setPorts(prev => [...prev, p])
        if (p.status === 'open') {
          setNewPorts(prev => new Set([...prev, p.port]))
          setTimeout(() => setNewPorts(prev => { const s = new Set(prev); s.delete(p.port); return s }), 3000)
        }
      }
    })

    es.addEventListener('complete', e => {
      const d: ScanSummary = JSON.parse((e as MessageEvent).data)
      doneRef.current = true
      setSummary(d)
      setScanTime(`${((Date.now() - startTimeRef.current) / 1000).toFixed(1)}s`)
      setRunning(false)
      es.close()
      // Load ALL ports for the closed/filtered toggle
      setPorts(prev => {
        // already have open; summary tells us total
        return prev
      })
    })

    es.addEventListener('scan_error', e => {
      setError(JSON.parse((e as MessageEvent).data).message)
      setRunning(false)
      es.close()
    })

    es.onerror = () => {
      if (doneRef.current) return
      setError('Cannot connect to the API server. Is it running on port 3001?')
      setRunning(false)
      es.close()
    }
  }

  function stopScan() {
    doneRef.current = true
    esRef.current?.close()
    setScanTime(`${((Date.now() - startTimeRef.current) / 1000).toFixed(1)}s (stopped)`)
    setRunning(false)
  }

  const openPorts = ports.filter(p => p.status === 'open')
  const rc = RISK_CFG[risk]

  return (
    <div className="min-h-full p-6 space-y-5">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex-shrink-0">
          <Scan size={22} className="text-rose-400" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Port Scanner</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-rose-400 bg-rose-500/10 border-rose-500/20">
              Red Team · Reconnaissance
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Real TCP port probing with service detection, banner grabbing, risk classification, and MITRE ATT&CK mapping.
          </p>
        </div>
      </motion.div>

      {/* Config */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
        className="card-surface p-5 space-y-4">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Target */}
          <div className="lg:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Target</label>
              <SavedTargets currentValue={target} onSelect={setTarget} accentColor="red" />
            </div>
            <div className="flex gap-2">
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !running && startScan()}
                placeholder="192.168.1.1 · hostname · domain.com"
                className="flex-1 bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] font-mono text-slate-300 placeholder:text-slate-600 outline-none focus:border-rose-500/40 focus:bg-surface-3 transition-all"
              />
              <motion.button
                onClick={running ? stopScan : startScan}
                whileTap={{ scale: 0.96 }}
                disabled={!running && !target.trim()}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-shrink-0',
                  running ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    : !target.trim() ? 'bg-wire-2 text-slate-600 cursor-not-allowed'
                      : 'bg-rose-500 hover:bg-rose-400 text-white',
                )}
              >
                {running ? <><Square size={13} />Stop</> : <><Play size={13} />Scan</>}
              </motion.button>
            </div>
          </div>

          {/* Timeout */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Timeout per port</label>
            <div className="flex gap-1.5">
              {[['500ms', 500], ['1s', 1000], ['2s', 2000], ['5s', 5000]].map(([label, val]) => (
                <button key={val} onClick={() => setTimeoutMs(val as number)} disabled={running}
                  className={clsx('flex-1 py-2 rounded-md text-[12px] font-medium border transition-all',
                    timeoutMs === val ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-wire-1 text-slate-500 border-wire-2 hover:text-slate-300',
                    running && 'opacity-40 cursor-not-allowed')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Port mode */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Port selection</label>
          <div className="flex gap-1.5 flex-wrap">
            {(['Quick', 'Standard', 'Thorough', 'Custom'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} disabled={running}
                className={clsx('px-3 py-1.5 rounded-md text-[12px] font-medium border transition-all',
                  mode === m ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-wire-1 text-slate-500 border-wire-2 hover:text-slate-300',
                  running && 'opacity-40 cursor-not-allowed')}>
                {m}
                {m !== 'Custom' && <span className="ml-1.5 text-[10px] opacity-60">{PRESET_PORT_COUNTS[m]}</span>}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {mode === 'Custom' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <input
                  value={customPorts}
                  onChange={e => setCustomPorts(e.target.value)}
                  placeholder="e.g.  80,443,8080-8090,3000-3100,22"
                  className="w-full mt-1.5 bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] font-mono text-slate-300 placeholder:text-slate-600 outline-none focus:border-rose-500/40 transition-all"
                />
                <p className="text-[11px] text-slate-700 mt-1">Comma-separated ports or ranges. Max 10,000 ports per scan.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress */}
        <AnimatePresence>
          {started && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-500 flex items-center gap-2">
                  {running && <Loader2 size={12} className="animate-spin text-rose-400" />}
                  {running
                    ? `Scanning ${scannedRef.current.toLocaleString()} / ${totalRef.current.toLocaleString()} ports…`
                    : `Complete — ${summary?.total.toLocaleString()} ports checked in ${scanTime}`}
                </span>
                <span className="font-mono text-slate-400">{progress}%</span>
              </div>
              <div className="h-1 bg-wire-2 rounded-full overflow-hidden">
                <motion.div className="h-full bg-rose-400 rounded-full"
                  animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut', duration: 0.25 }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-start gap-2.5 p-3 rounded-md bg-rose-500/8 border border-rose-500/20 text-[13px] text-rose-400">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{error}
          </motion.div>
        )}
      </motion.div>

      {/* Results */}
      <AnimatePresence>
        {started && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Target',   value: meta?.ip ?? '…',                        mono: true,  color: 'text-slate-200' },
                { label: 'Hostname', value: meta?.hostname || '—',                  mono: true,  color: 'text-slate-400' },
                { label: 'Open',     value: summary ? summary.open : openPorts.length, mono: false, color: 'text-emerald-400' },
                { label: 'Closed',   value: summary?.closed ?? '…',                 mono: false, color: 'text-slate-600' },
                { label: 'Filtered', value: summary?.filtered ?? '…',               mono: false, color: 'text-amber-500' },
                { label: 'Host Risk',value: risk === 'none' ? '—' : rc.label,       mono: false, color: rc.badge.split(' ')[0] },
              ].map(s => (
                <div key={s.label} className="card-surface px-4 py-3">
                  <div className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">{s.label}</div>
                  <div className={clsx('text-[15px] font-bold tracking-tight truncate', s.mono && 'font-mono text-[12px]', s.color)}>
                    {String(s.value)}
                  </div>
                </div>
              ))}
            </div>

            {/* Table + detail */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">

              {/* Port table */}
              <div className={clsx('card-surface overflow-hidden', selected ? 'xl:col-span-2' : 'xl:col-span-3')}>

                {/* Table toolbar */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-wire-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter ports…"
                        className="bg-wire-1 border border-wire-2 rounded-md pl-7 pr-3 py-1.5 text-[12px] text-slate-300 placeholder:text-slate-600 outline-none focus:border-slate-600 transition-all w-36" />
                    </div>
                    <label className="flex items-center gap-1.5 text-[12px] text-slate-500 cursor-pointer select-none">
                      <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)}
                        className="accent-rose-500" />
                      Show closed
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Sort */}
                    <div className="flex gap-1">
                      {(['port', 'risk', 'status'] as const).map(s => (
                        <button key={s} onClick={() => setSortBy(s)}
                          className={clsx('px-2 py-1 rounded text-[11px] capitalize border transition-all',
                            sortBy === s ? 'bg-slate-700/50 text-slate-200 border-slate-600' : 'text-slate-600 border-wire-2 hover:text-slate-400')}>
                          {s}
                        </button>
                      ))}
                    </div>

                    {/* Export */}
                    {openPorts.length > 0 && !running && (
                      <div className="flex gap-1">
                        {([
                          ['JSON', () => exportJson(meta, ports)],
                          ['CSV', () => exportCsv(meta, ports)],
                          ['TXT', () => exportText(meta, ports)],
                        ] as const).map(([label, fn]) => (
                          <button key={label} onClick={fn}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-slate-500 border border-wire-2 hover:text-slate-300 hover:border-wire-3 transition-all">
                            <Download size={10} />{label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-wire-1 bg-wire-1">
                  <span className="text-[11px] text-slate-600 uppercase tracking-wider w-14 flex-shrink-0">Port</span>
                  <span className="text-[11px] text-slate-600 uppercase tracking-wider w-16 flex-shrink-0">State</span>
                  <span className="text-[11px] text-slate-600 uppercase tracking-wider flex-1">Service</span>
                  <span className="hidden lg:block text-[11px] text-slate-600 uppercase tracking-wider flex-1">Banner</span>
                  <span className="text-[11px] text-slate-600 uppercase tracking-wider w-16 text-right">Risk</span>
                </div>

                {/* Rows */}
                <div className="overflow-y-auto" style={{ maxHeight: '55vh' }}>
                  {running && ports.length === 0 && (
                    <div className="py-12 flex items-center justify-center gap-2 text-slate-600 text-[13px]">
                      <Loader2 size={14} className="animate-spin" /> Probing ports…
                    </div>
                  )}
                  {!running && openPorts.length === 0 && started && !error && (
                    <div className="py-12 flex flex-col items-center gap-2 text-center">
                      <Shield size={22} className="text-slate-700" />
                      <p className="text-[13px] text-slate-600">No open ports found in the scanned range.</p>
                      <button onClick={() => setShowClosed(true)} className="text-[12px] text-blue-400 hover:text-blue-300 mt-1">
                        Show closed / filtered ports
                      </button>
                    </div>
                  )}
                  {filtered.map(p => (
                    <PortRow
                      key={p.port}
                      port={p}
                      selected={selected?.port === p.port}
                      isNew={newPorts.has(p.port)}
                      onSelect={() => setSelected(sel => sel?.port === p.port ? null : p)}
                    />
                  ))}
                  {filtered.length === 0 && ports.length > 0 && (
                    <div className="py-8 text-center text-[13px] text-slate-600">No ports match the filter.</div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-wire-1 flex items-center gap-3 text-[11px] text-slate-700">
                  <Zap size={10} />
                  <span>{openPorts.length} open · {filtered.length} shown</span>
                  {scanTime && <span className="ml-auto">{scanTime}</span>}
                </div>
              </div>

              {/* Detail panel */}
              <AnimatePresence>
                {selected && (
                  <div className="xl:col-span-1 sticky top-0">
                    <PortDetail port={selected} onClose={() => setSelected(null)} />
                  </div>
                )}
              </AnimatePresence>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!started && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="card-surface py-20 flex flex-col items-center gap-3 text-center">
          <Scan size={34} className="text-slate-700" />
          <p className="text-sm text-slate-500">Enter a target and click Scan.</p>
          <p className="text-[12px] text-slate-700 max-w-sm">
            Supports single IPs and hostnames. Use Quick for a fast check, Standard for
            common services, Thorough for ~100 ports, or Custom for any range.
          </p>
        </motion.div>
      )}
    </div>
  )
}
