import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  Bug, Play, Square, AlertTriangle, ShieldAlert, Shield, Info,
  ChevronDown, Download, Loader2, AlertCircle, ExternalLink, CheckCircle2,
  Zap, Wrench, ArrowRight, Check, Copy,
} from 'lucide-react'
import { SavedTargets } from '../../components/SavedTargets'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExploitStep { label: string; detail: string; commands?: string[] }
interface PatchStep   { label: string; detail: string; commands?: string[] }

interface VulnFinding {
  id: number
  ip: string
  hostname: string
  port: number
  ports: number[]
  service: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  cvss: number
  title: string
  description: string
  remediation: string
  cve: string | null
  tags: string[]
  exploitSteps: ExploitStep[]
  patchSteps: PatchStep[]
}

interface DiscoveredHost {
  ip: string
  hostname: string
  portCount: number
  ports: number[]
}

// ── Severity config ───────────────────────────────────────────────────────────

const SEV = {
  critical: { label: 'Critical', badge: 'text-rose-400 bg-rose-500/12 border-rose-500/30', bar: 'bg-rose-500', icon: ShieldAlert },
  high:     { label: 'High',     badge: 'text-orange-400 bg-orange-500/12 border-orange-500/30', bar: 'bg-orange-500', icon: AlertTriangle },
  medium:   { label: 'Medium',   badge: 'text-amber-400 bg-amber-500/12 border-amber-500/30', bar: 'bg-amber-400', icon: AlertTriangle },
  low:      { label: 'Low',      badge: 'text-slate-400 bg-slate-500/10 border-slate-500/20', bar: 'bg-slate-500', icon: Info },
  info:     { label: 'Info',     badge: 'text-blue-400 bg-blue-500/10 border-blue-500/20', bar: 'bg-blue-400', icon: Info },
}

// ── Attack chain visual ───────────────────────────────────────────────────────

function TerminalBlock({ commands, ip }: { commands: string[]; ip?: string }) {
  const [copied, setCopied] = useState<number | null>(null)

  function resolve(cmd: string) {
    return ip ? cmd.replace(/\{\{target\}\}/g, ip) : cmd
  }

  function renderLine(raw: string) {
    const resolved = resolve(raw)
    const isComment = resolved.trimStart().startsWith('#')
    if (isComment) {
      return <span className="text-slate-600 italic">{resolved}</span>
    }
    // highlight {{placeholders}} that were NOT substituted
    const parts = resolved.split(/({{[^}]+}})/)
    return parts.map((p, j) =>
      p.startsWith('{{') ? (
        <span key={j} className="text-amber-400/80">{p}</span>
      ) : (
        <span key={j}>{p}</span>
      )
    )
  }

  return (
    <div className="mt-2.5 rounded-md bg-[#0a0f1a] border border-slate-800 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-800 bg-[#0d1320]">
        <span className="h-2 w-2 rounded-full bg-rose-500/60" />
        <span className="h-2 w-2 rounded-full bg-amber-500/60" />
        <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
        <span className="ml-2 text-[10px] text-slate-600 font-mono">kali@kali:~$</span>
        {ip && <span className="ml-auto text-[10px] text-slate-700 font-mono">target: {ip}</span>}
      </div>
      <div className="p-3 space-y-1.5">
        {commands.map((cmd, i) => {
          const isComment = cmd.trimStart().startsWith('#')
          return (
            <div key={i} className="group flex items-start gap-2">
              {!isComment && <span className="text-emerald-500/70 font-mono text-[11px] select-none flex-shrink-0 mt-px">$</span>}
              {isComment && <span className="w-3 flex-shrink-0" />}
              <span className="flex-1 font-mono text-[12px] leading-relaxed break-all">{renderLine(cmd)}</span>
              {!isComment && (
                <button
                  onClick={() => { navigator.clipboard.writeText(resolve(cmd)); setCopied(i); setTimeout(() => setCopied(null), 1500) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                >
                  {copied === i
                    ? <Check size={10} className="text-emerald-400" />
                    : <Copy size={10} className="text-slate-600 hover:text-slate-400" />}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AttackChain({ steps, severity, ip }: { steps: ExploitStep[]; severity: string; ip: string }) {
  const [active, setActive] = useState<number | null>(null)

  const accentBorder = severity === 'critical' ? 'border-rose-500/30'
    : severity === 'high' ? 'border-orange-500/30'
    : severity === 'medium' ? 'border-amber-500/30'
    : 'border-slate-500/20'

  const numClass = severity === 'critical' ? 'bg-rose-500/20 text-rose-400'
    : severity === 'high' ? 'bg-orange-500/20 text-orange-400'
    : severity === 'medium' ? 'bg-amber-500/20 text-amber-400'
    : 'bg-slate-500/15 text-slate-400'

  const activeStepClass = severity === 'critical' ? 'border-rose-500/40 bg-rose-500/8 text-rose-300'
    : severity === 'high' ? 'border-orange-500/40 bg-orange-500/8 text-orange-300'
    : severity === 'medium' ? 'border-amber-500/40 bg-amber-500/8 text-amber-300'
    : 'border-slate-500/30 bg-slate-500/8 text-slate-300'

  const connClass = severity === 'critical' ? 'text-rose-700'
    : severity === 'high' ? 'text-orange-700'
    : severity === 'medium' ? 'text-amber-700'
    : 'text-slate-700'

  const labelColor = severity === 'critical' ? 'text-rose-400'
    : severity === 'high' ? 'text-orange-400'
    : severity === 'medium' ? 'text-amber-400'
    : 'text-slate-400'

  return (
    <div className="space-y-4">
      {/* step pills */}
      <div className="flex items-center flex-wrap gap-1.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <button
              onClick={() => setActive(a => a === i ? null : i)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-md border text-[12px] font-medium transition-all',
                active === i ? activeStepClass : 'border-wire-2 bg-wire-1 text-slate-400 hover:border-wire-3 hover:text-slate-200',
              )}
            >
              <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded font-mono', numClass)}>{i + 1}</span>
              {step.label}
            </button>
            {i < steps.length - 1 && <ArrowRight size={12} className={connClass} />}
          </div>
        ))}
      </div>

      {/* expanded step */}
      <AnimatePresence mode="wait">
        {active !== null && (
          <motion.div
            key={active}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={clsx('rounded-lg border p-4 space-y-3', accentBorder, 'bg-surface-0')}
          >
            <div className="flex items-center gap-2">
              <span className={clsx('text-[10px] font-mono font-bold px-1.5 py-0.5 rounded', numClass)}>
                STEP {active + 1}
              </span>
              <span className={clsx('text-[13px] font-semibold', labelColor)}>{steps[active].label}</span>
            </div>
            <p className="text-[13px] text-slate-400 leading-relaxed">{steps[active].detail}</p>
            {steps[active].commands && steps[active].commands!.length > 0 && (
              <TerminalBlock commands={steps[active].commands!} ip={ip} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[11px] text-slate-700">Click a step to expand the technique — commands are copyable.</p>
    </div>
  )
}

// ── Patch guide ───────────────────────────────────────────────────────────────

function PatchGuide({ steps, ip }: { steps: PatchStep[]; ip: string }) {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setChecked(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })
  const allDone = checked.size === steps.length

  return (
    <div className="space-y-2">
      {allDone && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[12px] text-emerald-400 font-medium mb-3"
        >
          <CheckCircle2 size={13} /> All remediation steps marked complete.
        </motion.div>
      )}
      {steps.map((step, i) => {
        const done = checked.has(i)
        return (
          <motion.button
            key={i}
            onClick={() => toggle(i)}
            whileTap={{ scale: 0.99 }}
            className={clsx(
              'w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-md border transition-all',
              done
                ? 'bg-emerald-500/8 border-emerald-500/20'
                : 'bg-wire-1 border-wire-2 hover:border-wire-3',
            )}
          >
            <div className={clsx(
              'flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center mt-0.5 transition-all',
              done ? 'bg-emerald-500 border-emerald-500' : 'border-wire-3 bg-surface-0',
            )}>
              {done && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={clsx('text-[12px] font-semibold', done ? 'text-emerald-400' : 'text-slate-300')}>
                {step.label}
              </div>
              <div className={clsx('text-[12px] mt-0.5 leading-relaxed', done ? 'text-slate-600 line-through' : 'text-slate-500')}>
                {step.detail}
              </div>
              {!done && step.commands && step.commands.length > 0 && (
                <TerminalBlock commands={step.commands} ip={ip} />
              )}
            </div>
          </motion.button>
        )
      })}
      <p className="text-[11px] text-slate-700 pt-1">Check off steps as you apply them — state resets when you close this card.</p>
    </div>
  )
}

// ── Finding card ──────────────────────────────────────────────────────────────

type FindingTab = 'overview' | 'attack' | 'patch'

function FindingCard({ finding, index }: { finding: VulnFinding; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<FindingTab>('overview')
  const cfg = SEV[finding.severity] ?? SEV.info
  const Icon = cfg.icon

  const borderColor = {
    critical: 'border-l-rose-500',
    high:     'border-l-orange-500',
    medium:   'border-l-amber-400',
    low:      'border-l-slate-500',
    info:     'border-l-blue-400',
  }[finding.severity] ?? 'border-l-slate-500'

  const iconBg = {
    critical: 'bg-rose-500/15',
    high:     'bg-orange-500/15',
    medium:   'bg-amber-500/15',
    low:      'bg-slate-500/15',
    info:     'bg-blue-500/15',
  }[finding.severity] ?? 'bg-slate-500/15'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.6), duration: 0.25 }}
      className={clsx('card-surface overflow-hidden border-l-2', borderColor)}
    >
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left">
        <div className="flex items-start gap-4 px-4 py-3.5">
          <div className={clsx('p-1.5 rounded-md flex-shrink-0 mt-0.5', iconBg)}>
            <Icon size={14} className={cfg.badge.split(' ')[0]} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={clsx('text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border', cfg.badge)}>
                {cfg.label}
              </span>
              <span className="text-[11px] font-mono text-slate-600 bg-wire-1 px-1.5 py-0.5 rounded border border-wire-2">
                CVSS {finding.cvss.toFixed(1)}
              </span>
              {finding.cve && (
                <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                  {finding.cve}
                </span>
              )}
              {finding.exploitSteps.length > 0 && (
                <span className="text-[10px] text-rose-500 bg-rose-500/8 px-1.5 py-0.5 rounded border border-rose-500/15 flex items-center gap-1">
                  <Zap size={9} /> Attack chain
                </span>
              )}
              {finding.patchSteps.length > 0 && (
                <span className="text-[10px] text-emerald-500 bg-emerald-500/8 px-1.5 py-0.5 rounded border border-emerald-500/15 flex items-center gap-1">
                  <Wrench size={9} /> Patch guide
                </span>
              )}
            </div>
            <div className="text-[14px] font-semibold text-slate-100 leading-tight">{finding.title}</div>
            <div className="flex items-center gap-3 mt-1.5 text-[12px] text-slate-500">
              <span className="font-mono">{finding.ip}</span>
              {finding.hostname && <><span className="text-slate-700">·</span><span>{finding.hostname}</span></>}
              <span className="text-slate-700">·</span>
              <span className="font-mono">:{finding.port} {finding.service && `(${finding.service})`}</span>
            </div>
          </div>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0 mt-1">
            <ChevronDown size={14} className="text-slate-600" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-wire-1"
          >
            {/* Tab bar */}
            <div className="flex border-b border-wire-1 bg-surface-1">
              {([
                { key: 'overview', label: 'Overview',     Icon: Shield },
                { key: 'attack',   label: 'Attack Chain', Icon: Zap },
                { key: 'patch',    label: 'Patch Guide',  Icon: Wrench },
              ] as { key: FindingTab; label: string; Icon: typeof Shield }[]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium border-b-2 transition-all',
                    tab === t.key
                      ? t.key === 'attack'
                        ? 'text-rose-400 border-rose-500'
                        : t.key === 'patch'
                        ? 'text-emerald-400 border-emerald-500'
                        : 'text-slate-200 border-slate-500'
                      : 'text-slate-600 border-transparent hover:text-slate-400',
                  )}
                >
                  <t.Icon size={12} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="px-4 py-4 bg-surface-1">
              <AnimatePresence mode="wait">
                {tab === 'overview' && (
                  <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="space-y-4">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Description</div>
                      <p className="text-[13px] text-slate-400 leading-relaxed">{finding.description}</p>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Remediation Summary</div>
                      <p className="text-[13px] text-slate-400 leading-relaxed">{finding.remediation}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {finding.cve && (
                        <a
                          href={`https://nvd.nist.gov/vuln/detail/${finding.cve}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[12px] text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <ExternalLink size={12} /> NVD: {finding.cve}
                        </a>
                      )}
                      {finding.tags.map(t => (
                        <span key={t} className="text-[11px] text-slate-600 bg-wire-1 border border-wire-2 px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}

                {tab === 'attack' && (
                  <motion.div key="attack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Zap size={13} className="text-rose-400" />
                      <span className="text-[12px] font-semibold text-rose-400 uppercase tracking-wider">How Attackers Exploit This</span>
                    </div>
                    {finding.exploitSteps.length > 0
                      ? <AttackChain steps={finding.exploitSteps} severity={finding.severity} ip={finding.ip} />
                      : <p className="text-[13px] text-slate-600">No attack chain detail available for this finding.</p>
                    }
                  </motion.div>
                )}

                {tab === 'patch' && (
                  <motion.div key="patch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Wrench size={13} className="text-emerald-400" />
                      <span className="text-[12px] font-semibold text-emerald-400 uppercase tracking-wider">Remediation Checklist</span>
                    </div>
                    {finding.patchSteps.length > 0
                      ? <PatchGuide steps={finding.patchSteps} ip={finding.ip} />
                      : <p className="text-[13px] text-slate-600">No patch steps available for this finding.</p>
                    }
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Severity summary donut-style bars ─────────────────────────────────────────

function SeverityBar({ counts, total }: { counts: Record<string, number>; total: number }) {
  if (total === 0) return null
  const segments = [
    { key: 'critical', color: 'bg-rose-500',   label: 'C' },
    { key: 'high',     color: 'bg-orange-500',  label: 'H' },
    { key: 'medium',   color: 'bg-amber-400',   label: 'M' },
    { key: 'low',      color: 'bg-slate-500',   label: 'L' },
  ]
  return (
    <div className="flex rounded-full overflow-hidden h-2 w-full gap-px">
      {segments.map(s => {
        const pct = total > 0 ? (counts[s.key] / total) * 100 : 0
        return pct > 0 ? (
          <motion.div
            key={s.key}
            className={clsx('h-full', s.color)}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        ) : null
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function VulnScanner() {
  const [target, setTarget] = useState('')
  const [mode, setMode] = useState('Standard')
  const [running, setRunning] = useState(false)
  const [scanStarted, setScanStarted] = useState(false)
  const [phase, setPhase] = useState<'discovery' | 'analysis' | 'done'>('discovery')
  const [discoveryProgress, setDiscoveryProgress] = useState({ scanned: 0, total: 0 })
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([])
  const [findings, setFindings] = useState<VulnFinding[]>([])
  const [hostsAnalyzed, setHostsAnalyzed] = useState({ done: 0, total: 0 })
  const [statusMsg, setStatusMsg] = useState('')
  const [scanTime, setScanTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string>('all')

  const esRef = useRef<EventSource | null>(null)
  const startTimeRef = useRef(0)
  const completedRef = useRef(false)

  const filteredFindings = severityFilter === 'all'
    ? findings
    : findings.filter(f => f.severity === severityFilter)

  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high:     findings.filter(f => f.severity === 'high').length,
    medium:   findings.filter(f => f.severity === 'medium').length,
    low:      findings.filter(f => f.severity === 'low').length,
  }
  const total = findings.length

  const discPct = discoveryProgress.total > 0
    ? Math.round((discoveryProgress.scanned / discoveryProgress.total) * 100)
    : 0

  function handleScan() {
    if (!target.trim()) return
    esRef.current?.close()
    completedRef.current = false

    setFindings([])
    setDiscoveredHosts([])
    setDiscoveryProgress({ scanned: 0, total: 0 })
    setHostsAnalyzed({ done: 0, total: 0 })
    setScanStarted(true)
    setRunning(true)
    setPhase('discovery')
    setScanTime('')
    setError(null)
    setSeverityFilter('all')
    setStatusMsg('Starting host discovery…')
    startTimeRef.current = Date.now()

    const url = `/api/vuln-scan?target=${encodeURIComponent(target.trim())}&mode=${encodeURIComponent(mode)}`
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('start', (e) => {
      const { total } = JSON.parse((e as MessageEvent).data)
      setDiscoveryProgress({ scanned: 0, total })
      setStatusMsg(`Scanning ${total} host${total !== 1 ? 's' : ''}…`)
    })
    es.addEventListener('host_found', (e) => {
      const host = JSON.parse((e as MessageEvent).data) as DiscoveredHost
      setDiscoveredHosts(prev => [...prev, host])
      setStatusMsg(`Discovered ${host.ip} — ${host.portCount} open port${host.portCount !== 1 ? 's' : ''}`)
    })
    es.addEventListener('discovery_progress', (e) => {
      const { scanned, total } = JSON.parse((e as MessageEvent).data)
      setDiscoveryProgress({ scanned, total })
    })
    es.addEventListener('phase', (e) => {
      const { hostCount } = JSON.parse((e as MessageEvent).data)
      setPhase('analysis')
      setHostsAnalyzed({ done: 0, total: hostCount })
      setStatusMsg(`Analyzing ${hostCount} live host${hostCount !== 1 ? 's' : ''}…`)
    })
    es.addEventListener('finding', (e) => {
      const finding = JSON.parse((e as MessageEvent).data) as VulnFinding
      setFindings(prev => [...prev, finding])
    })
    es.addEventListener('host_analyzed', (e) => {
      const { index, total } = JSON.parse((e as MessageEvent).data)
      setHostsAnalyzed({ done: index, total })
    })
    es.addEventListener('complete', (e) => {
      const { hostsScanned, findingsTotal } = JSON.parse((e as MessageEvent).data)
      completedRef.current = true
      setScanTime(`${((Date.now() - startTimeRef.current) / 1000).toFixed(1)}s`)
      setPhase('done')
      setRunning(false)
      setStatusMsg(`Scan complete — ${hostsScanned} host${hostsScanned !== 1 ? 's' : ''}, ${findingsTotal} finding${findingsTotal !== 1 ? 's' : ''}`)
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
    setPhase('done')
    setRunning(false)
    setStatusMsg('Scan stopped by user.')
  }

  function exportReport() {
    const lines = [
      'CyberWeb Vulnerability Report',
      `Target: ${target}`,
      `Date: ${new Date().toISOString()}`,
      `Total findings: ${findings.length}`,
      '',
      ...findings.map(f => [
        `[${f.severity.toUpperCase()}] ${f.title}`,
        `  Host: ${f.ip}${f.hostname ? ` (${f.hostname})` : ''} Port: ${f.port} (${f.service})`,
        `  CVSS: ${f.cvss}${f.cve ? `  CVE: ${f.cve}` : ''}`,
        `  ${f.description}`,
        `  Remediation: ${f.remediation}`,
        f.exploitSteps.length > 0 ? `  Attack chain:\n${f.exploitSteps.map((s, i) => `    ${i + 1}. ${s.label}: ${s.detail}`).join('\n')}` : '',
        f.patchSteps.length > 0 ? `  Patch steps:\n${f.patchSteps.map((s, i) => `    ${i + 1}. ${s.label}: ${s.detail}`).join('\n')}` : '',
        '',
      ].filter(Boolean).join('\n')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vuln-report-${target.replace(/[^a-z0-9]/gi, '-')}.txt`
    a.click()
  }

  return (
    <div className="min-h-full p-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex-shrink-0">
          <Bug size={22} className="text-rose-400" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Vulnerability Scanner</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-rose-400 bg-rose-500/10 border-rose-500/20">
              Red Team · Analysis
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            CVE detection with interactive attack chains and step-by-step remediation guides.
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
                placeholder="IP · hostname · CIDR range"
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
            <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Scan Depth</label>
            <div className="flex gap-1.5">
              {(['Quick', 'Standard'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} disabled={running}
                  className={clsx('flex-1 py-2 rounded-md text-[12px] font-medium border transition-all',
                    mode === m ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-wire-1 text-slate-500 border-wire-2 hover:text-slate-300',
                    running && 'opacity-50 cursor-not-allowed')}>
                  {m}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-700">
              {mode === 'Quick' ? 'Fast — 11 common ports + rule checks' : 'Standard — 27 ports + banners + version analysis'}
            </p>
          </div>
        </div>

        {/* Progress */}
        {scanStarted && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="flex items-center gap-3 text-[12px]">
              {[
                { key: 'discovery', label: 'Discovery' },
                { key: 'analysis',  label: 'Analysis' },
                { key: 'done',      label: 'Complete' },
              ].map((p, i) => (
                <span key={p.key} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-slate-700">→</span>}
                  <span className={clsx(
                    phase === p.key ? 'text-rose-400 font-medium' :
                      (phase === 'analysis' && p.key === 'discovery') || phase === 'done'
                        ? 'text-slate-500 line-through' : 'text-slate-700',
                  )}>
                    {p.label}
                  </span>
                </span>
              ))}
              {running && <Loader2 size={12} className="animate-spin text-rose-400 ml-1" />}
              {scanTime && <span className="ml-auto text-[11px] text-slate-600 font-mono">{scanTime}</span>}
            </div>

            {(phase === 'discovery' || discoveryProgress.total > 0) && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Host discovery — {discoveryProgress.scanned}/{discoveryProgress.total}</span>
                  <span>{discPct}%</span>
                </div>
                <div className="h-1 bg-wire-2 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-rose-400 rounded-full"
                    animate={{ width: `${discPct}%` }} transition={{ ease: 'easeOut', duration: 0.3 }} />
                </div>
              </div>
            )}

            {hostsAnalyzed.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Vulnerability analysis — {hostsAnalyzed.done}/{hostsAnalyzed.total} hosts</span>
                  <span>{hostsAnalyzed.total > 0 ? Math.round((hostsAnalyzed.done / hostsAnalyzed.total) * 100) : 0}%</span>
                </div>
                <div className="h-1 bg-wire-2 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-amber-400 rounded-full"
                    animate={{ width: `${hostsAnalyzed.total > 0 ? (hostsAnalyzed.done / hostsAnalyzed.total) * 100 : 0}%` }}
                    transition={{ ease: 'easeOut', duration: 0.3 }} />
                </div>
              </div>
            )}

            <p className="text-[12px] text-slate-500">{statusMsg}</p>
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
          {/* Severity summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.entries(counts) as [string, number][]).map(([sev, count]) => {
              const cfg = SEV[sev as keyof typeof SEV]
              return (
                <motion.button key={sev}
                  onClick={() => setSeverityFilter(f => f === sev ? 'all' : sev)}
                  whileTap={{ scale: 0.97 }}
                  className={clsx('card-surface px-4 py-3 text-left transition-all border',
                    severityFilter === sev ? cfg.badge : 'border-wire-2 hover:border-wire-3')}>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 capitalize">{sev}</div>
                  <div className={clsx('text-2xl font-bold font-mono tracking-tight', cfg.badge.split(' ')[0])}>
                    {count}
                  </div>
                </motion.button>
              )
            })}
          </div>

          {/* Stacked severity bar */}
          {total > 0 && (
            <div className="card-surface px-4 py-3 space-y-2">
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>{total} total finding{total !== 1 ? 's' : ''}</span>
                <span className="text-slate-600 font-mono">{target}</span>
              </div>
              <SeverityBar counts={counts} total={total} />
              <div className="flex gap-4 text-[11px] text-slate-600">
                {Object.entries(counts).filter(([, c]) => c > 0).map(([sev, count]) => (
                  <span key={sev} className="flex items-center gap-1.5">
                    <span className={clsx('h-2 w-2 rounded-full', SEV[sev as keyof typeof SEV]?.bar)} />
                    {count} {sev}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Discovered hosts */}
          {discoveredHosts.length > 0 && (
            <div className="card-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-wire-1 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-slate-400">Live Hosts ({discoveredHosts.length})</span>
              </div>
              <div className="p-3 flex flex-wrap gap-2">
                {discoveredHosts.map(h => (
                  <div key={h.ip} className="flex items-center gap-2 bg-wire-1 border border-wire-2 rounded-md px-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="font-mono text-[12px] text-slate-300">{h.ip}</span>
                    {h.hostname && <span className="text-[11px] text-slate-600 truncate max-w-32">{h.hostname}</span>}
                    <span className="text-[11px] text-slate-600">{h.portCount} ports</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Findings list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-200">
                  Findings
                  {findings.length > 0 && <span className="ml-2 text-[12px] font-normal text-slate-600">{filteredFindings.length} shown</span>}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {['all', 'critical', 'high', 'medium', 'low'].map(s => (
                    <button key={s} onClick={() => setSeverityFilter(s)}
                      className={clsx('px-2.5 py-1.5 rounded text-[11px] font-medium capitalize border transition-all',
                        severityFilter === s ? 'bg-slate-700/50 text-slate-200 border-slate-600' : 'text-slate-500 border-wire-2 hover:text-slate-300')}>
                      {s}
                    </button>
                  ))}
                </div>
                {findings.length > 0 && (
                  <button onClick={exportReport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-slate-400 hover:text-slate-200 border border-wire-2 hover:border-wire-3 transition-all">
                    <Download size={12} /> Report
                  </button>
                )}
              </div>
            </div>

            {running && findings.length === 0 && (
              <div className="card-surface py-10 flex items-center justify-center gap-2 text-slate-600 text-sm">
                <Loader2 size={14} className="animate-spin" /> Checking for vulnerabilities…
              </div>
            )}

            {filteredFindings.map((f, i) => <FindingCard key={f.id} finding={f} index={i} />)}

            {phase === 'done' && findings.length === 0 && (
              <div className="card-surface py-12 flex flex-col items-center gap-3 text-center">
                <CheckCircle2 size={32} className="text-emerald-400" />
                <p className="text-sm font-medium text-slate-300">No known vulnerabilities detected</p>
                <p className="text-[12px] text-slate-600">
                  No rule matches found for the discovered ports. This does not guarantee the host is secure.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {!scanStarted && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="card-surface py-16 flex flex-col items-center gap-3 text-center">
          <Bug size={32} className="text-slate-700" />
          <p className="text-sm text-slate-600">Enter a target and click Scan to detect vulnerabilities.</p>
          <p className="text-[12px] text-slate-700">Each finding includes an interactive attack chain and a step-by-step patch checklist.</p>
        </motion.div>
      )}
    </div>
  )
}
