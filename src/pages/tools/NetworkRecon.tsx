import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  Network, Play, Square, Download, ChevronDown,
  Activity, Globe, Search, AlertCircle, Loader2, Shield,
} from 'lucide-react'
import { SavedTargets } from '../../components/SavedTargets'
import type { ScanHost } from '../../types'

interface PortResult {
  port: number
  status: 'open' | 'closed' | 'filtered'
  service: string
  banner: string
}

interface FullHost extends ScanHost {
  allPorts: PortResult[]
  banners: Record<number, string>
}

const PORT_STATUS_STYLE = {
  open:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  closed:   'text-slate-600  bg-wire-1           border-wire-2',
  filtered: 'text-amber-500  bg-amber-500/8      border-amber-500/20',
}

function ScanRow({ host, index }: { host: FullHost; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const openPorts = host.allPorts?.filter(p => p.status === 'open') ?? []
  const closedPorts = host.allPorts?.filter(p => p.status === 'closed') ?? []
  const filteredPorts = host.allPorts?.filter(p => p.status === 'filtered') ?? []
  const isDown = host.status === 'down'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.2 }}
      className="border-b border-wire-1 last:border-0"
    >
      {/* Summary row */}
      <button
        onClick={() => !isDown && setExpanded(e => !e)}
        className={clsx(
          'w-full flex items-center gap-4 px-5 py-3 text-left transition-colors duration-100',
          !isDown ? 'hover:bg-wire-1 cursor-pointer' : 'cursor-default opacity-40',
        )}
      >
        <div className="w-32 flex-shrink-0 font-mono text-[13px] text-slate-300">{host.ip}</div>
        <div className="flex-1 min-w-0 font-mono text-[12px] text-slate-500 truncate">
          {host.hostname || '—'}
        </div>
        {/* Open port chips */}
        <div className="hidden md:flex items-center gap-1 flex-wrap w-56 flex-shrink-0">
          {openPorts.slice(0, 5).map(p => (
            <span key={p.port} className="text-[11px] px-1.5 py-0.5 rounded font-mono text-emerald-400 bg-emerald-500/10">
              {p.port}
            </span>
          ))}
          {openPorts.length > 5 && (
            <span className="text-[11px] text-slate-600 font-mono">+{openPorts.length - 5}</span>
          )}
          {openPorts.length === 0 && !isDown && (
            <span className="text-[11px] text-slate-700">no open ports</span>
          )}
        </div>
        <div className="hidden lg:block w-36 flex-shrink-0 text-[12px] text-slate-500 truncate">{host.os}</div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <span className={clsx(
            'text-[11px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider',
            host.status === 'up' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-600 bg-wire-1 border-wire-2',
          )}>
            {host.status}
          </span>
          {!isDown && (
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={13} className="text-slate-600" />
            </motion.div>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden bg-surface-1 border-t border-wire-1"
          >
            <div className="p-5 space-y-5">
              {/* Host info bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
                {[
                  { label: 'IP Address', val: host.ip },
                  { label: 'Hostname', val: host.hostname || '—' },
                  { label: 'OS Guess', val: host.os },
                  { label: 'Ports Scanned', val: host.allPorts?.length ?? 0 },
                ].map(r => (
                  <div key={r.label}>
                    <div className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">{r.label}</div>
                    <div className="font-mono text-slate-300">{r.val}</div>
                  </div>
                ))}
              </div>

              {/* All ports table */}
              <div>
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  All Scanned Ports ({host.allPorts?.length ?? 0})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {host.allPorts?.map(p => (
                    <div key={p.port} className={clsx(
                      'flex items-start gap-2 px-3 py-2 rounded-md border',
                      p.status === 'open' ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-wire-1 border-wire-1',
                    )}>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-mono text-[12px] text-slate-300 w-10 flex-shrink-0">{p.port}</span>
                        <span className={clsx('text-[11px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-medium flex-shrink-0', PORT_STATUS_STYLE[p.status])}>
                          {p.status}
                        </span>
                        <span className="text-[11px] text-slate-500 truncate">{p.service || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Banners */}
              {host.banners && Object.keys(host.banners).length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
                    Service Banners
                  </div>
                  <div className="space-y-2">
                    {Object.entries(host.banners).map(([port, banner]) => (
                      <div key={port} className="bg-surface-0 border border-wire-2 rounded-md px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-mono text-emerald-400">{port}/tcp</span>
                          <span className="text-[11px] text-slate-600">{host.allPorts?.find(p => p.port === parseInt(port))?.service}</span>
                        </div>
                        <pre className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap break-all leading-relaxed">
                          {banner}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div>
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Quick Actions</div>
                <div className="flex flex-wrap gap-2">
                  <button className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-wire-2 text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors">
                    <Network size={12} /> Port scan
                  </button>
                  <button className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-wire-2 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors">
                    <Activity size={12} /> Vuln scan
                  </button>
                  <button className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-wire-2 text-slate-400 hover:text-slate-200 transition-colors">
                    <Globe size={12} /> Web scan
                  </button>
                  <button className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-wire-2 text-slate-400 hover:text-purple-400 hover:border-purple-500/30 transition-colors">
                    <Shield size={12} /> Check vulns
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function NetworkRecon() {
  const [target, setTarget] = useState('')
  const [mode, setMode] = useState('Standard')
  const [running, setRunning] = useState(false)
  const [scanStarted, setScanStarted] = useState(false)
  const [hosts, setHosts] = useState<FullHost[]>([])
  const [progress, setProgress] = useState({ scanned: 0, total: 0 })
  const [scanTime, setScanTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'up' | 'down'>('all')

  const esRef = useRef<EventSource | null>(null)
  const startTimeRef = useRef(0)
  const completedRef = useRef(false)

  const filtered = hosts.filter(h => {
    const txt = filter.toLowerCase()
    const match = !txt || h.ip.includes(txt) || h.hostname.toLowerCase().includes(txt)
    const status = statusFilter === 'all' || h.status === statusFilter
    return match && status
  })

  const upHosts = hosts.filter(h => h.status === 'up')
  const totalOpenPorts = upHosts.reduce((a, h) => a + h.ports.length, 0)
  const pct = progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0

  function handleScan() {
    if (!target.trim()) return
    esRef.current?.close()
    completedRef.current = false

    setHosts([])
    setScanStarted(true)
    setRunning(true)
    setProgress({ scanned: 0, total: 0 })
    setScanTime('')
    setError(null)
    startTimeRef.current = Date.now()

    const url = `/api/scan?target=${encodeURIComponent(target.trim())}&mode=${encodeURIComponent(mode)}`
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('start', (e) => {
      const { total } = JSON.parse((e as MessageEvent).data)
      setProgress({ scanned: 0, total })
    })
    es.addEventListener('host', (e) => {
      const host = JSON.parse((e as MessageEvent).data) as FullHost
      setHosts(prev => [...prev, host])
    })
    es.addEventListener('progress', (e) => {
      const { scanned, total } = JSON.parse((e as MessageEvent).data)
      setProgress({ scanned, total })
    })
    es.addEventListener('complete', () => {
      completedRef.current = true
      setScanTime(`${((Date.now() - startTimeRef.current) / 1000).toFixed(1)}s`)
      setRunning(false)
      es.close()
    })
    es.addEventListener('scan_error', (e) => {
      const { message } = JSON.parse((e as MessageEvent).data)
      setError(message)
      setRunning(false)
      es.close()
    })
    es.onerror = () => {
      if (completedRef.current) return
      setError('Could not connect to the API server. Make sure it is running.')
      setRunning(false)
      es.close()
    }
  }

  function handleStop() {
    completedRef.current = true
    esRef.current?.close()
    setScanTime(`${((Date.now() - startTimeRef.current) / 1000).toFixed(1)}s (stopped)`)
    setRunning(false)
  }

  function exportCsv() {
    const rows = [
      'IP,Hostname,OS,Status,Open Ports,Services,Banners',
      ...hosts.map(h => [
        h.ip, h.hostname, h.os, h.status,
        h.ports.join(' '),
        h.services.join(' '),
        `"${Object.entries(h.banners ?? {}).map(([p, b]) => `${p}: ${b.replace(/"/g, "'")}`).join(' | ')}"`,
      ].join(',')),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `recon-${target.replace(/[^a-z0-9]/gi, '-')}.csv`
    a.click()
  }

  const portCounts = mode === 'Quick' ? 11 : mode === 'Standard' ? 27 : 37

  return (
    <div className="min-h-full p-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex-shrink-0">
          <Network size={22} className="text-rose-400" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Network Recon</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-rose-400 bg-rose-500/10 border-rose-500/20">
              Red Team · Reconnaissance
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Host discovery, full port scan with status, service detection, and banner grabbing.
          </p>
        </div>
      </motion.div>

      {/* Config */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="card-surface p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Target</label>
              <SavedTargets currentValue={target} onSelect={setTarget} accentColor="red" />
            </div>
            <div className="flex gap-2">
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !running && handleScan()}
                placeholder="192.168.1.0/24 · single IP · hostname"
                className="flex-1 bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] font-mono text-slate-300 placeholder:text-slate-600 outline-none focus:border-rose-500/40 focus:bg-surface-3 transition-all"
              />
              <motion.button
                onClick={running ? handleStop : handleScan}
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

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Mode — {portCounts} ports
            </label>
            <div className="flex gap-1.5">
              {['Quick', 'Standard', 'Thorough'].map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={running}
                  className={clsx(
                    'flex-1 py-2 rounded-md text-[12px] font-medium border transition-all',
                    mode === m ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      : 'bg-wire-1 text-slate-500 border-wire-2 hover:text-slate-300',
                    running && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Progress */}
        {(running || (scanStarted && progress.total > 0)) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5">
            <div className="flex justify-between text-[12px]">
              <span className="text-slate-500 flex items-center gap-2">
                {running && <Loader2 size={12} className="animate-spin text-rose-400" />}
                {running
                  ? `Scanning ${progress.scanned} / ${progress.total} hosts — banners & port status…`
                  : `Complete — ${progress.scanned} hosts checked`}
                {scanTime && !running && <span className="text-slate-700 ml-1">({scanTime})</span>}
              </span>
              <span className="font-mono text-slate-400">{pct}%</span>
            </div>
            <div className="h-1 bg-wire-2 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-rose-400 rounded-full"
                animate={{ width: `${pct}%` }}
                transition={{ ease: 'easeOut', duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-start gap-2.5 p-3 rounded-md bg-rose-500/8 border border-rose-500/20 text-[13px] text-rose-400">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{error}
          </motion.div>
        )}
      </motion.div>

      {/* Results */}
      {scanStarted && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Hosts Up', value: upHosts.length, color: 'text-emerald-400' },
              { label: 'Checked', value: progress.scanned, color: 'text-slate-300' },
              { label: 'Open Ports', value: totalOpenPorts, color: 'text-blue-400' },
              { label: 'Scan Time', value: scanTime || (running ? '…' : '—'), color: 'text-slate-400' },
            ].map(s => (
              <div key={s.label} className="card-surface px-4 py-3">
                <div className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">{s.label}</div>
                <div className={clsx('text-xl font-bold font-mono tracking-tight', s.color)}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="card-surface overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-wire-1 gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-200">
                Discovered Hosts
                {upHosts.length > 0 && <span className="ml-2 text-[12px] font-normal text-slate-600">{upHosts.length} live</span>}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter…"
                    className="bg-wire-1 border border-wire-2 rounded-md pl-7 pr-3 py-1.5 text-[12px] text-slate-300 placeholder:text-slate-600 outline-none focus:border-slate-600 transition-all w-36" />
                </div>
                <div className="flex gap-1">
                  {(['all', 'up', 'down'] as const).map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={clsx('px-2.5 py-1.5 rounded text-[11px] font-medium capitalize border transition-all',
                        statusFilter === s ? 'bg-slate-700/50 text-slate-200 border-slate-600' : 'text-slate-500 border-wire-2 hover:text-slate-300')}>
                      {s}
                    </button>
                  ))}
                </div>
                {hosts.length > 0 && (
                  <button onClick={exportCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-slate-400 hover:text-slate-200 border border-wire-2 hover:border-wire-3 transition-all">
                    <Download size={12} /> CSV
                  </button>
                )}
              </div>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-4 px-5 py-2 border-b border-wire-1 bg-wire-1">
              <div className="w-32 flex-shrink-0 text-[11px] text-slate-600 uppercase tracking-wider">IP</div>
              <div className="flex-1 text-[11px] text-slate-600 uppercase tracking-wider">Hostname</div>
              <div className="hidden md:block w-56 flex-shrink-0 text-[11px] text-slate-600 uppercase tracking-wider">Open Ports</div>
              <div className="hidden lg:block w-36 flex-shrink-0 text-[11px] text-slate-600 uppercase tracking-wider">OS</div>
              <div className="flex-shrink-0 w-24 text-right text-[11px] text-slate-600 uppercase tracking-wider">Status</div>
            </div>

            <div>
              {running && hosts.length === 0 && (
                <div className="py-10 flex items-center justify-center gap-2 text-slate-600 text-sm">
                  <Loader2 size={14} className="animate-spin" /> Discovering hosts…
                </div>
              )}
              {filtered.map((host, i) => <ScanRow key={host.ip} host={host} index={i} />)}
              {!running && hosts.length > 0 && filtered.length === 0 && (
                <div className="py-10 text-center text-slate-600 text-sm">No hosts match the current filter.</div>
              )}
              {!running && hosts.length === 0 && scanStarted && (
                <div className="py-10 text-center text-slate-600 text-sm">No hosts responded to ping.</div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {!scanStarted && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="card-surface py-16 flex flex-col items-center gap-3 text-center">
          <Network size={32} className="text-slate-700" />
          <p className="text-sm text-slate-600">Enter a target and click Scan to begin discovery.</p>
          <p className="text-[12px] text-slate-700">Supports single IPs, hostnames, and CIDR ranges up to /22.</p>
        </motion.div>
      )}
    </div>
  )
}
