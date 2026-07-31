import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  Wifi, RefreshCw, Shield, ShieldAlert, ShieldX, ChevronDown,
  Radio, AlertTriangle, CheckCircle2, FileText,
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { generateHTMLReport } from '../../lib/wirelessReport'

const API = 'http://localhost:3001'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BssidInfo { mac: string; signal: number; channel: string; radioType: string }
interface ExploitStep { label: string; detail: string; commands?: string[] }
interface PatchStep   { label: string; detail: string; commands?: string[] }

interface WifiNetwork {
  ssid: string; authentication: string; encryption: string
  networkType: string; bssids: BssidInfo[]
}

interface WifiFinding {
  id: number; ssid: string; authentication: string; encryption: string
  bssids: BssidInfo[]; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  cvss: number; title: string; description: string; remediation: string
  tags: string[]; exploitSteps: ExploitStep[]; patchSteps: PatchStep[]
}

type SortKey = 'signal' | 'ssid' | 'security'

const SEV_DOTS: Record<string, string> = {
  critical: 'bg-rose-500', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-slate-500',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSecurityLevel(auth: string): 'open' | 'wep' | 'wpa' | 'wpa2' | 'wpa3' | 'unknown' {
  const a = (auth || '').toLowerCase()
  if (!a || a === 'open' || a === 'none') return 'open'
  if (a.includes('wpa3')) return 'wpa3'
  if (a.includes('wpa2')) return 'wpa2'
  if (a.includes('wpa')) return 'wpa'
  if (a.includes('wep')) return 'wep'
  return 'unknown'
}

function getSecurityLabel(auth: string): string {
  const a = (auth || '').toLowerCase()
  if (!a || a === 'open' || a === 'none') return 'Open'
  if (a.includes('wpa3')) return 'WPA3'
  if (a.includes('wpa2') && a.includes('enterprise')) return 'WPA2-Ent'
  if (a.includes('wpa2')) return 'WPA2'
  if (a.includes('wpa')) return 'WPA'
  if (a.includes('wep')) return 'WEP'
  return auth
}

function getBestSignal(n: WifiNetwork) {
  if (!n.bssids.length) return 0
  return Math.max(...n.bssids.map(b => b.signal))
}

function getChannelInfo(n: WifiNetwork): string {
  const first = n.bssids[0]
  if (!first?.channel) return '—'
  const ch = parseInt(first.channel)
  if (isNaN(ch)) return `Ch ${first.channel}`
  return ch > 14 ? `5 GHz / Ch ${ch}` : `2.4 GHz / Ch ${ch}`
}

function getBarColor(pct: number) {
  if (pct >= 70) return 'bg-emerald-400'
  if (pct >= 40) return 'bg-amber-400'
  return 'bg-rose-400'
}

function getFindingCountForNetwork(ssid: string, findings: WifiFinding[]) {
  return findings.filter(f => f.ssid === ssid || (!f.ssid && !ssid))
}

const SEVERITY_ORDER: Record<string, number> = { wpa3: 0, wpa2: 1, wpa: 2, wep: 3, open: 4, unknown: 5 }

// ── Network list row ──────────────────────────────────────────────────────────

function SignalBars({ pct, size = 'md' }: { pct: number; size?: 'sm' | 'md' }) {
  const filled = pct >= 80 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : pct >= 20 ? 1 : 0
  const color = getBarColor(pct)
  const w = size === 'sm' ? 'w-1' : 'w-1.5'
  const h = size === 'sm' ? 'h-3' : 'h-4'
  return (
    <div className={clsx('flex items-end gap-0.5', h)}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={clsx('rounded-sm transition-colors', w, filled > i ? color : 'bg-wire-3')}
          style={{ height: `${(i + 1) * 25}%` }} />
      ))}
    </div>
  )
}

function SecurityBadge({ auth }: { auth: string }) {
  const level = getSecurityLevel(auth)
  const label = getSecurityLabel(auth)
  const styles: Record<string, string> = {
    open:    'text-rose-400 bg-rose-500/10 border-rose-500/20',
    wep:     'text-orange-400 bg-orange-500/10 border-orange-500/20',
    wpa:     'text-amber-400 bg-amber-500/10 border-amber-500/20',
    wpa2:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
    wpa3:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    unknown: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  }
  const Icon = level === 'open' || level === 'wep' ? ShieldX : level === 'wpa' ? ShieldAlert : Shield
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border', styles[level] ?? styles.unknown)}>
      <Icon size={10} /> {label}
    </span>
  )
}

function NetworkRow({ network, networkFindings, index }: { network: WifiNetwork; networkFindings: WifiFinding[]; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const best = getBestSignal(network)
  const ssid = network.ssid || '(Hidden Network)'
  const criticalCount = networkFindings.filter(f => f.severity === 'critical' || f.severity === 'high').length
  const totalIssues = networkFindings.length

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-wire-1/50 transition-colors text-left">
        <div className="flex-shrink-0"><SignalBars pct={best} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('text-[13px] font-medium truncate', network.ssid ? 'text-slate-200' : 'text-slate-500 italic')}>{ssid}</span>
            <SecurityBadge auth={network.authentication} />
            {totalIssues > 0 && (
              <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                criticalCount > 0 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20')}>
                {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5">{getChannelInfo(network)}</div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="text-[12px] font-mono text-slate-300">{best}%</div>
            <div className="text-[11px] text-slate-600">{network.bssids.length} AP{network.bssids.length !== 1 ? 's' : ''}</div>
          </div>
          <ChevronDown size={14} className={clsx('text-slate-600 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="px-5 pb-3 border-t border-wire-1 space-y-2">
              <div className="pt-3 grid grid-cols-2 gap-x-8 gap-y-1">
                {[['Authentication', network.authentication], ['Encryption', network.encryption], ['Network Type', network.networkType]].map(([l, v]) => (
                  <div key={l} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-600 w-28 flex-shrink-0">{l}</span>
                    <span className="text-[12px] text-slate-400 font-mono">{v || '—'}</span>
                  </div>
                ))}
              </div>
              {network.bssids.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Access Points</div>
                  {network.bssids.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 bg-wire-1 rounded-md px-3 py-2">
                      <SignalBars pct={b.signal} size="sm" />
                      <span className="text-[12px] font-mono text-slate-400 flex-1 min-w-0 truncate">{b.mac}</span>
                      <span className="text-[11px] text-slate-500 flex-shrink-0">{b.radioType || '—'}</span>
                      <span className="text-[11px] text-slate-500 flex-shrink-0">Ch {b.channel || '—'}</span>
                      <span className="text-[12px] font-mono text-slate-400 w-10 text-right flex-shrink-0">{b.signal}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── SpectrumView ──────────────────────────────────────────────────────────────

interface SpectrumEntry { network: WifiNetwork; bssid: BssidInfo; channel: number }

function secColor(auth: string): string {
  const level = getSecurityLevel(auth)
  if (level === 'open')  return '#ef4444'
  if (level === 'wep')   return '#f97316'
  if (level === 'wpa')   return '#f59e0b'
  if (level === 'wpa2')  return '#3b82f6'
  if (level === 'wpa3')  return '#22c55e'
  return '#8b5cf6'
}

function scanFingerprint(networks: WifiNetwork[]): string {
  const macs = networks.flatMap(n => n.bssids.map(b => b.mac)).sort().join('')
  let h = 5381
  for (let i = 0; i < macs.length; i++) h = (Math.imul(h, 33) ^ macs.charCodeAt(i)) >>> 0
  return h.toString(16).toUpperCase().padStart(8, '0')
}

function SpectrumBand({ entries, channels, label, width = 640 }: {
  entries: SpectrumEntry[]; channels: number[]; label: string; width?: number
}) {
  const ML = 38, MB = 22, MT = 10
  const plotW = width - ML - 10
  const plotH = 88
  const H = plotH + MT + MB
  const baseY = MT + plotH
  const minCh = channels[0], maxCh = channels[channels.length - 1]
  const range = maxCh === minCh ? 1 : maxCh - minCh
  const chW = plotW / range

  function chX(ch: number) { return ML + ((ch - minCh) / range) * plotW }
  function sigY(sig: number) { return MT + (1 - sig / 100) * plotH }
  function bell(cx: number, py: number, spread: number) {
    const lx = cx - spread, rx = cx + spread
    return `M ${lx.toFixed(1)},${baseY} C ${lx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${py.toFixed(1)} C ${cx.toFixed(1)},${py.toFixed(1)} ${rx.toFixed(1)},${py.toFixed(1)} ${rx.toFixed(1)},${baseY} Z`
  }

  const spread = chW * 2.2
  const yTicks = [25, 50, 75, 100]
  // Show ~8 channel tick labels max to avoid crowding
  const step = Math.max(1, Math.ceil(channels.length / 8))
  const chTicks = channels.filter((_, i) => i % step === 0)

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1.5">{label}</div>
      <svg width="100%" viewBox={`0 0 ${width} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
        {/* Grid */}
        {yTicks.map(p => (
          <g key={p}>
            <line x1={ML} y1={sigY(p)} x2={ML + plotW} y2={sigY(p)} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="3 4" />
            <text x={ML - 4} y={sigY(p)} textAnchor="end" dominantBaseline="middle" fill="#334155" fontSize={9} fontFamily="monospace">{p}%</text>
          </g>
        ))}
        {/* Baseline */}
        <line x1={ML} y1={baseY} x2={ML + plotW} y2={baseY} stroke="#1e293b" strokeWidth={1} />
        {/* Channel ticks */}
        {chTicks.map(ch => (
          <g key={ch}>
            <line x1={chX(ch)} y1={baseY} x2={chX(ch)} y2={baseY + 4} stroke="#1e293b" strokeWidth={1} />
            <text x={chX(ch)} y={baseY + 12} textAnchor="middle" fill="#334155" fontSize={9} fontFamily="monospace">{ch}</text>
          </g>
        ))}
        {/* Preferred channel shading for 2.4 GHz */}
        {[1, 6, 11].filter(c => c >= minCh && c <= maxCh).map(ch => (
          <rect key={ch} x={chX(ch) - chW * 0.6} y={MT} width={chW * 1.2} height={plotH}
            fill="#22c55e" fillOpacity={0.04} rx={2} />
        ))}
        {/* Bell curves — background fill first, then stroke on top */}
        {entries.map((e, i) => {
          const cx = chX(e.channel), py = sigY(e.bssid.signal)
          const col = secColor(e.network.authentication)
          return <path key={`fill-${i}`} d={bell(cx, py, spread)} fill={col} fillOpacity={0.18} />
        })}
        {entries.map((e, i) => {
          const cx = chX(e.channel), py = sigY(e.bssid.signal)
          const col = secColor(e.network.authentication)
          return (
            <g key={`stroke-${i}`}>
              <path d={bell(cx, py, spread)} fill="none" stroke={col} strokeOpacity={0.65} strokeWidth={1.5} />
              <circle cx={cx} cy={py} r={2.5} fill={col} fillOpacity={0.9} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function SpectrumView({ networks, scannedAt }: { networks: WifiNetwork[]; scannedAt: string }) {
  if (!networks.length) return null

  const fingerprint = scanFingerprint(networks)
  const entries24: SpectrumEntry[] = [], entries5: SpectrumEntry[] = []

  for (const n of networks) {
    for (const b of n.bssids) {
      const ch = parseInt(b.channel)
      if (isNaN(ch)) continue
      ;(ch <= 14 ? entries24 : entries5).push({ network: n, bssid: b, channel: ch })
    }
  }

  const channels24 = Array.from({ length: 13 }, (_, i) => i + 1)

  const occupied5 = Array.from(new Set(entries5.map(e => e.channel))).sort((a, b) => a - b)
  const ALL_5GHZ = [36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165]
  const channels5 = occupied5.length
    ? ALL_5GHZ.filter(c => occupied5.some(o => Math.abs(o - c) <= 4)).slice(
        Math.max(0, ALL_5GHZ.indexOf(occupied5[0]) - 1),
        ALL_5GHZ.indexOf(occupied5[occupied5.length - 1]) + 2,
      )
    : []

  const totalBssids = entries24.length + entries5.length
  const scanTime = scannedAt ? new Date(scannedAt).toLocaleString() : '—'

  return (
    <div className="card-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-wire-1">
        <div className="flex items-center gap-3">
          <Radio size={13} className="text-emerald-400" />
          <span className="text-[13px] font-semibold text-slate-200">Spectrum Evidence</span>
          <span className="text-[11px] font-mono text-emerald-400/70 bg-emerald-500/8 border border-emerald-500/15 px-2 py-0.5 rounded">
            #{fingerprint}
          </span>
        </div>
        <div className="text-[11px] text-slate-600 tabular-nums">
          {totalBssids} BSSID{totalBssids !== 1 ? 's' : ''} · {entries24.length > 0 ? '2.4 GHz' : ''}{entries24.length > 0 && entries5.length > 0 ? ' + ' : ''}{entries5.length > 0 ? '5 GHz' : ''} · {scanTime}
        </div>
      </div>

      {/* Chart area */}
      <div className="px-5 pt-4 pb-3 space-y-5">
        {entries24.length > 0 && (
          <SpectrumBand entries={entries24} channels={channels24} label="2.4 GHz — Channels 1–13" />
        )}
        {entries5.length > 0 && channels5.length > 0 && (
          <SpectrumBand entries={entries5} channels={channels5} label="5 GHz Band" />
        )}
        {entries24.length === 0 && entries5.length === 0 && (
          <p className="text-[12px] text-slate-600 py-4 text-center">No channel data available — BSSIDs without channel information cannot be plotted.</p>
        )}
      </div>

      {/* Legend + AP evidence */}
      <div className="px-5 py-3 border-t border-wire-1 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { color: '#22c55e', label: 'WPA3' }, { color: '#3b82f6', label: 'WPA2' },
            { color: '#f59e0b', label: 'WPA' },  { color: '#f97316', label: 'WEP' },
            { color: '#ef4444', label: 'Open' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span style={{ background: l.color }} className="w-2 h-2 rounded-full opacity-80" />
              <span className="text-[11px] text-slate-500">{l.label}</span>
            </div>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-slate-700 font-mono hidden sm:block">
          Peak height = signal · Width = channel spread · ● = AP
        </span>
      </div>

      {/* AP evidence strip */}
      {totalBssids > 0 && (
        <div className="border-t border-wire-1 px-5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Detected Access Points</div>
          <div className="flex flex-wrap gap-1.5">
            {[...entries24, ...entries5].slice(0, 16).map((e, i) => (
              <div key={i}
                style={{ borderColor: secColor(e.network.authentication) + '40' }}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-wire-1 border text-[10px] font-mono">
                <span style={{ background: secColor(e.network.authentication) }} className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
                <span className="text-slate-400">{e.bssid.mac}</span>
                <span className="text-slate-600">ch{e.channel}</span>
                <span className="text-slate-600">{e.bssid.signal}%</span>
              </div>
            ))}
            {totalBssids > 16 && (
              <div className="px-2 py-1 rounded bg-wire-1 border border-wire-2 text-[10px] text-slate-600">
                +{totalBssids - 16} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function WirelessAnalyzer() {
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [findings, setFindings] = useState<WifiFinding[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('signal')
  const [scannedAt, setScannedAt] = useState<string>('')

  const scan = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const res = await apiFetch(`${API}/api/wireless-scan`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      setNetworks(data.networks || [])
      setFindings(data.findings || [])
      setScannedAt(data.scannedAt || new Date().toISOString())
      setScanned(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reach server')
    } finally {
      setScanning(false)
    }
  }, [])

  const sortedNetworks = [...networks].sort((a, b) => {
    if (sortKey === 'signal') return getBestSignal(b) - getBestSignal(a)
    if (sortKey === 'ssid') return a.ssid.localeCompare(b.ssid)
    return (SEVERITY_ORDER[getSecurityLevel(a.authentication)] ?? 5) - (SEVERITY_ORDER[getSecurityLevel(b.authentication)] ?? 5)
  })

  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high:     findings.filter(f => f.severity === 'high').length,
    medium:   findings.filter(f => f.severity === 'medium').length,
    low:      findings.filter(f => f.severity === 'low').length,
  }
  const openCount = networks.filter(n => getSecurityLevel(n.authentication) === 'open').length
  const bestSignal = networks.length ? Math.max(...networks.map(getBestSignal)) : 0

  function downloadHTMLReport() {
    const html = generateHTMLReport(networks, findings)
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `wireless-security-report-${Date.now()}.html`
    a.click()
  }

  return (
    <div className="min-h-full p-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg border bg-rose-500/10 border-rose-500/20 flex-shrink-0">
            <Wifi size={22} className="text-rose-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Wireless Analyzer</h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-rose-400 bg-rose-500/10 border-rose-500/20">
                Red Team · Reconnaissance
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">
              Scan nearby WiFi networks and analyze each one for security vulnerabilities with attack chains and step-by-step remediation guides.
            </p>
          </div>
        </div>

        <motion.button onClick={scan} disabled={scanning} whileTap={{ scale: 0.97 }}
          className={clsx('flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all flex-shrink-0',
            scanning ? 'opacity-50 cursor-not-allowed bg-wire-2 text-slate-500' : 'bg-rose-500 hover:bg-rose-400 text-white shadow-sm')}>
          <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning…' : scanned ? 'Rescan' : 'Scan & Analyze'}
        </motion.button>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card-surface border border-rose-500/20 p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-rose-400">Scan failed</div>
              <div className="text-[12px] text-slate-500 mt-0.5 font-mono">{error}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {scanned && !error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">

            {/* Stats strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: 'Networks',   value: networks.length,   sub: 'visible',        dim: false },
                { label: 'Open',       value: openCount,          sub: 'no encryption',  dim: openCount === 0 },
                { label: 'Critical',   value: counts.critical,    sub: 'severity',       dim: counts.critical === 0 },
                { label: 'Best Signal',value: `${bestSignal}%`,   sub: 'strongest AP',   dim: false },
              ] as const).map(stat => (
                <div key={stat.label} className="card-surface p-4">
                  <div className={clsx('text-2xl font-bold tabular-nums',
                    stat.dim ? 'text-slate-600'
                      : stat.label === 'Critical' && counts.critical > 0 ? 'text-rose-400'
                      : stat.label === 'Open' && openCount > 0 ? 'text-rose-400'
                      : 'text-slate-200')}>
                    {stat.value}
                  </div>
                  <div className="text-[12px] font-medium text-slate-400 mt-0.5">{stat.label}</div>
                  <div className="text-[11px] text-slate-600">{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Spectrum evidence chart */}
            <SpectrumView networks={networks} scannedAt={scannedAt} />

            {/* Analysis summary + report */}
            <div className="card-surface px-5 py-4 flex items-center justify-between gap-6 flex-wrap">
              <div className="flex items-center gap-4 text-[12px] text-slate-500 flex-wrap">
                {findings.length > 0 ? (
                  <>
                    <span>{findings.length} finding{findings.length !== 1 ? 's' : ''} across {networks.length} network{networks.length !== 1 ? 's' : ''}</span>
                    {Object.entries(counts).filter(([, c]) => c > 0).map(([sev, count]) => (
                      <span key={sev} className="flex items-center gap-1.5">
                        <span className={clsx('h-2 w-2 rounded-full', SEV_DOTS[sev])} />
                        {count} {sev}
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 size={13} />
                    All {networks.length} network{networks.length !== 1 ? 's' : ''} passed security checks
                  </span>
                )}
              </div>
              <button onClick={downloadHTMLReport}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/25 hover:bg-blue-500/20 transition-colors flex-shrink-0">
                <FileText size={14} /> Generate Report
              </button>
            </div>

            {/* Network list */}
            <div className="card-surface overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-wire-1">
                <h2 className="text-sm font-semibold text-slate-200">{networks.length} Networks Discovered</h2>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-600 mr-1">Sort</span>
                  {(['signal', 'ssid', 'security'] as SortKey[]).map(key => (
                    <button key={key} onClick={() => setSortKey(key)}
                      className={clsx('px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors',
                        sortKey === key ? 'bg-rose-500/15 text-rose-400' : 'text-slate-500 hover:text-slate-300')}>
                      {key}
                    </button>
                  ))}
                </div>
              </div>
              {sortedNetworks.length === 0 ? (
                <div className="py-10 text-center">
                  <Radio size={22} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No networks detected</p>
                  <p className="text-[12px] text-slate-600 mt-1">Make sure your wireless adapter is enabled</p>
                </div>
              ) : (
                <div className="divide-y divide-wire-1">
                  {sortedNetworks.map((n, i) => (
                    <NetworkRow
                      key={`${n.ssid}-${i}`}
                      network={n}
                      networkFindings={getFindingCountForNetwork(n.ssid, findings)}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Initial / loading state */}
      {!scanned && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="card-surface p-14 flex flex-col items-center text-center">
          <div className={clsx('p-4 rounded-full border mb-4',
            scanning ? 'bg-rose-500/10 border-rose-500/15' : 'bg-wire-1 border-wire-2')}>
            <Wifi size={28} className={scanning ? 'text-rose-400 animate-pulse' : 'text-slate-600'} />
          </div>
          {scanning ? (
            <>
              <p className="text-slate-300 text-sm font-medium">Scanning and analyzing…</p>
              <p className="text-[12px] text-slate-600 mt-1">Querying wireless adapter and running security checks</p>
            </>
          ) : (
            <>
              <p className="text-slate-400 text-sm">Press <span className="font-medium text-slate-300">Scan & Analyze</span> to discover and assess nearby WiFi networks</p>
              <p className="text-[12px] text-slate-600 mt-1">Detects open networks, WEP, TKIP, default SSIDs, and more — with attack chains and remediation guides</p>
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}
