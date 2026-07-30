import { useState, useRef } from 'react'
import { apiUrl } from '../../lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  Users, Search, ExternalLink, Copy, Check, Download,
  ChevronDown, ChevronRight, AlertCircle, Loader2,
  Code2, Gamepad2, Music, Video, Briefcase, BookOpen,
  ShoppingBag, Link2, Dumbbell, Cpu, Share2, Eye, type LucideIcon,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SiteResult {
  name: string
  url: string
  category: string
  found: boolean
  uncertain?: boolean
  responseTime?: number
  httpStatus?: number
  error?: string
}

interface CorrelationSignal {
  label: string
  detail: string
  weight: number
  positive: boolean
}

// ── Category config ───────────────────────────────────────────────────────────

const CAT_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string; Icon: LucideIcon
}> = {
  social:       { label: 'Social Media',       color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     Icon: Share2 },
  developer:    { label: 'Developer',           color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  Icon: Code2 },
  gaming:       { label: 'Gaming',              color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', Icon: Gamepad2 },
  creative:     { label: 'Content & Creative',  color: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20',    Icon: Search },
  music:        { label: 'Music & Audio',       color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  Icon: Music },
  video:        { label: 'Video',               color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     Icon: Video },
  support:      { label: 'Support & Commerce',  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   Icon: ShoppingBag },
  professional: { label: 'Professional',        color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    Icon: Briefcase },
  identity:     { label: 'Identity & Links',    color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    Icon: Link2 },
  academia:     { label: 'Academia',            color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  Icon: BookOpen },
  fitness:      { label: 'Fitness',             color: 'text-lime-400',    bg: 'bg-lime-500/10',    border: 'border-lime-500/20',    Icon: Dumbbell },
  tech:         { label: 'Tech & Community',    color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  Icon: Cpu },
}

const HIGH_SIGNAL = new Set(['GitHub', 'LinkedIn', 'Twitter / X', 'Instagram', 'Reddit', 'HackerRank', 'Keybase', 'Dev.to'])

// ── Correlation analysis ──────────────────────────────────────────────────────

function analyzeCorrelation(found: SiteResult[], username: string): {
  confidence: number; identityTags: string[]; signals: CorrelationSignal[]
} {
  const foundCats = new Set(found.map(r => r.category))
  const highSignalFound = found.filter(r => HIGH_SIGNAL.has(r.name))
  const signals: CorrelationSignal[] = []

  const platformScore = Math.min(found.length * 3, 30)
  signals.push({
    label: `${found.length} platform${found.length !== 1 ? 's' : ''} found`,
    detail: 'Each confirmed platform adds evidence of intentional registration under this username.',
    weight: platformScore, positive: found.length > 0,
  })

  if (foundCats.size >= 3) {
    signals.push({
      label: `${foundCats.size} distinct categories`,
      detail: 'Cross-category presence (social + dev + gaming) strongly suggests a single identity rather than coincidental username collision.',
      weight: Math.min(foundCats.size * 5, 25), positive: true,
    })
  }

  if (highSignalFound.length > 0) {
    signals.push({
      label: `${highSignalFound.length} high-signal platform${highSignalFound.length !== 1 ? 's' : ''}`,
      detail: `Found on: ${highSignalFound.map(r => r.name).join(', ')}. These are identity-anchored platforms where impersonation is rare.`,
      weight: Math.min(highSignalFound.length * 8, 30), positive: true,
    })
  }

  if (username.length >= 6 && found.length > 5) {
    signals.push({
      label: 'Username specificity',
      detail: `"${username}" (${username.length} chars) is specific enough that random collision across ${found.length} platforms is statistically improbable.`,
      weight: 10, positive: true,
    })
  } else if (username.length <= 4 && found.length > 3) {
    signals.push({
      label: 'Short username — collision risk',
      detail: `"${username}" is short. Multiple unrelated people may share it across different platforms independently.`,
      weight: -10, positive: false,
    })
  }

  if (found.length === 0) {
    signals.push({
      label: 'No accounts found',
      detail: 'Username may not exist, be private, or metadata was stripped. Some platforms actively block automated checks.',
      weight: 0, positive: false,
    })
  }

  const confidence = Math.min(Math.max(signals.reduce((a, s) => a + s.weight, 0), 0), 95)

  // Identity tags from platform patterns
  const foundNames = new Set(found.map(r => r.name))
  const tags: string[] = []
  const devSites   = ['GitHub','GitLab','Dev.to','HackerRank','LeetCode','npm','PyPI','HuggingFace','Stack Exchange']
  const crtrSites  = ['YouTube','Twitch','SoundCloud','Medium','Substack']
  const dsnrSites  = ['Behance','Dribbble','ArtStation','DeviantArt']
  const gamerSites = ['Steam','Twitch','Chess.com','Lichess','osu!','FACEIT']
  const musicSites = ['SoundCloud','Bandcamp','Last.fm','Mixcloud','Audiomack']
  const writeSites = ['Medium','Substack','Wattpad','Quora','Archive of Our Own']

  if (devSites.filter(p => foundNames.has(p)).length >= 2)   tags.push('Software Developer')
  if (crtrSites.filter(p => foundNames.has(p)).length >= 2)  tags.push('Content Creator')
  if (dsnrSites.filter(p => foundNames.has(p)).length >= 2)  tags.push('Designer / Artist')
  if (gamerSites.filter(p => foundNames.has(p)).length >= 2) tags.push('Gamer')
  if (musicSites.filter(p => foundNames.has(p)).length >= 2) tags.push('Musician')
  if (writeSites.filter(p => foundNames.has(p)).length >= 2) tags.push('Writer')
  if (foundNames.has('LinkedIn') || foundNames.has('Wellfound'))          tags.push('Professional')
  if (foundNames.has('Academia.edu') || foundNames.has('ResearchGate'))   tags.push('Researcher')

  return { confidence, identityTags: tags, signals }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function CopyBtn({ value, size = 12 }: { value: string; size?: number }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-orange-400"
    >
      {copied ? <Check size={size} className="text-emerald-400" /> : <Copy size={size} className="text-slate-600" />}
    </button>
  )
}

function CategorySection({ cat, results, collapsed, onToggle }: {
  cat: string; results: SiteResult[]; collapsed: boolean; onToggle: () => void
}) {
  const cfg = CAT_CONFIG[cat] ?? CAT_CONFIG.tech
  const { Icon } = cfg
  const found = results.filter(r => r.found)
  if (results.length === 0) return null

  return (
    <div className="card-surface overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-wire-1/50 transition-colors">
        <Icon size={13} className={cfg.color} />
        <span className={clsx('text-[12px] font-semibold', cfg.color)}>{cfg.label}</span>
        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full border font-semibold', cfg.bg, cfg.border, cfg.color)}>
          {found.length}/{results.length}
        </span>
        <div className="flex-1 h-px bg-wire-1 mx-1" />
        <div className="flex gap-0.5 items-center">
          {results.slice(0, 10).map(r => (
            <div key={r.name} className={clsx('w-1.5 h-1.5 rounded-full', r.found ? 'bg-emerald-400' : 'bg-wire-2')} />
          ))}
          {results.length > 10 && <span className="text-[10px] text-slate-600 ml-0.5">+{results.length - 10}</span>}
        </div>
        {collapsed ? <ChevronRight size={12} className="text-slate-600 ml-1" /> : <ChevronDown size={12} className="text-slate-600 ml-1" />}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.22 }} className="overflow-hidden border-t border-wire-1">
            <div className="divide-y divide-wire-1">
              {results.map(r => (
                <div key={r.name} className={clsx('group flex items-center gap-3 px-4 py-2', r.found && 'bg-emerald-500/3')}>
                  <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', r.found ? 'bg-emerald-400' : 'bg-slate-700')} />
                  <span className={clsx('text-[12px] flex-1 min-w-0 truncate', r.found ? 'text-slate-200' : 'text-slate-600')}>
                    {r.name}
                  </span>
                  {r.found ? (
                    <>
                      <span className="text-[10px] text-slate-600 font-mono flex-shrink-0 tabular-nums">
                        {r.responseTime ? `${r.responseTime}ms` : ''}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyBtn value={r.url} size={11} />
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="p-0.5 rounded text-slate-600 hover:text-orange-400 transition-colors">
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-700 flex-shrink-0">
                      {r.error === 'timeout' ? 'timeout' : 'not found'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function UncertainSection({ sites, collapsed, onToggle }: {
  sites: SiteResult[]; collapsed: boolean; onToggle: () => void
}) {
  if (sites.length === 0) return null
  return (
    <div className="card-surface overflow-hidden border border-amber-500/15">
      <button onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-amber-500/5 transition-colors">
        <Eye size={13} className="text-amber-400" />
        <span className="text-[12px] font-semibold text-amber-400">Manual Verification Required</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-semibold bg-amber-500/10 border-amber-500/20 text-amber-400">
          {sites.length} sites
        </span>
        <div className="flex-1 h-px bg-wire-1 mx-1" />
        <span className="text-[10px] text-slate-600 mr-1">Server-side checking not possible for these platforms</span>
        {collapsed ? <ChevronRight size={12} className="text-slate-600" /> : <ChevronDown size={12} className="text-slate-600" />}
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.22 }} className="overflow-hidden border-t border-amber-500/15">
            <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10">
              <p className="text-[11px] text-amber-400/70">
                These platforms use client-side rendering (React/Next.js SPAs) or aggressive bot protection.
                The server always returns HTTP 200 regardless of whether the account exists.
                Click the links below to verify manually in your browser.
              </p>
            </div>
            <div className="divide-y divide-wire-1">
              {sites.map(r => (
                <div key={r.name} className="group flex items-center gap-3 px-4 py-2">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400/50" />
                  <span className="text-[12px] flex-1 min-w-0 truncate text-amber-300/80">{r.name}</span>
                  <span className="text-[10px] text-amber-600 font-medium flex-shrink-0">unverifiable</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyBtn value={r.url} size={11} />
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="p-0.5 rounded text-slate-600 hover:text-amber-400 transition-colors">
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function Sherlock() {
  const [username, setUsername] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<SiteResult[]>([])
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const [uncertainCollapsed, setUncertainCollapsed] = useState(true)
  const [showNotFound, setShowNotFound] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  function startSearch() {
    const q = username.trim()
    if (!q || running) return

    esRef.current?.close()
    setResults([])
    setProgress(0)
    setTotal(0)
    setDone(false)
    setRunning(true)
    setCollapsedCats(new Set())
    setUncertainCollapsed(true)
    setActiveFilter(null)

    const es = new EventSource(apiUrl(`http://localhost:3001/api/sherlock?username=${encodeURIComponent(q)}`))
    esRef.current = es

    es.addEventListener('start', (e) => {
      const d = JSON.parse((e as MessageEvent).data)
      setTotal(d.total)
    })
    es.addEventListener('result', (e) => {
      const d: SiteResult = JSON.parse((e as MessageEvent).data)
      setResults(prev => [...prev, d])
      setProgress(prev => prev + 1)
    })
    es.addEventListener('complete', () => {
      setRunning(false); setDone(true); es.close()
    })
    es.addEventListener('scan_error', () => {
      setRunning(false); es.close()
    })
    es.onerror = () => {
      setRunning(false); es.close()
    }
  }

  function cancelSearch() {
    esRef.current?.close()
    setRunning(false)
  }

  const uncertain = results.filter(r => r.uncertain)
  const checked = results.filter(r => !r.uncertain)
  const found = checked.filter(r => r.found)
  const correlation = done && found.length > 0 ? analyzeCorrelation(found, username.trim()) : null
  const displayResults = showNotFound ? checked : found
  const allCats = [...new Set(checked.map(r => r.category))]
  const filteredCats = activeFilter ? [activeFilter] : allCats
  const catGroups = filteredCats.reduce((acc, cat) => {
    const catResults = displayResults.filter(r => r.category === cat)
    if (catResults.length > 0) acc[cat] = catResults
    return acc
  }, {} as Record<string, SiteResult[]>)

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0

  function exportResults() {
    const q = username.trim()
    const lines = [
      `Sherlock Report — @${q}`,
      `Generated: ${new Date().toISOString()}`,
      `Confirmed: ${found.length} | Manual-check: ${uncertain.length} | Checked: ${checked.length}`,
      '',
      '=== CONFIRMED ACCOUNTS ===',
      ...found.map(r => `[${r.category.toUpperCase()}] ${r.name}: ${r.url}`),
      '',
      '=== MANUAL VERIFICATION (server-side check not possible) ===',
      ...uncertain.map(r => `[${r.category.toUpperCase()}] ${r.name}: ${r.url}`),
      '',
      '=== NOT FOUND ===',
      ...checked.filter(r => !r.found).map(r => r.name),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `sherlock-${q}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-full p-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex-shrink-0">
          <Users size={22} className="text-orange-400" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Sherlock</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-orange-400 bg-orange-500/10 border-orange-500/20">
              OSINT · Username Discovery
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Hunts a username across 200+ platforms and correlates findings into a confidence-scored identity profile.
          </p>
        </div>
      </motion.div>

      {/* Search input */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
        className="card-surface p-4 space-y-3">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Target Username</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-[13px] font-mono select-none">@</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9._\-]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && startSearch()}
              placeholder="username"
              className="w-full bg-surface-0 border border-wire-2 rounded-md pl-7 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>
          {running ? (
            <button onClick={cancelSearch}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm font-medium transition-colors border border-rose-500/20">
              Cancel
            </button>
          ) : (
            <button onClick={startSearch} disabled={!username.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
              <Search size={14} /> Hunt
            </button>
          )}
        </div>

        <AnimatePresence>
          {(running || done) && results.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
              <div className="h-1 bg-wire-2 rounded-full overflow-hidden">
                <motion.div animate={{ width: `${pct}%` }} transition={{ ease: 'easeOut', duration: 0.2 }}
                  className={clsx('h-full rounded-full', done ? 'bg-emerald-500' : 'bg-orange-400')} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span className="flex items-center gap-1.5">
                  {running && <Loader2 size={11} className="animate-spin text-orange-400" />}
                  {running
                    ? `Checking ${progress} / ${total} platforms…`
                    : `Complete — ${found.length} confirmed · ${uncertain.length} manual-check · ${checked.length - found.length} not found`}
                </span>
                <span>{pct}%</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Correlation analysis */}
      <AnimatePresence>
        {correlation && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-wire-1 flex items-center gap-2">
              <Users size={13} className="text-orange-400" />
              <span className="text-[12px] font-semibold text-slate-300">Correlation Analysis</span>
            </div>
            <div className="p-5 space-y-4">
              {/* Confidence bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Same-person confidence</span>
                  <span className={clsx('font-bold',
                    correlation.confidence >= 70 ? 'text-emerald-400' :
                    correlation.confidence >= 40 ? 'text-amber-400' : 'text-slate-500')}>
                    {correlation.confidence}%
                  </span>
                </div>
                <div className="h-2 bg-wire-2 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${correlation.confidence}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className={clsx('h-full rounded-full',
                      correlation.confidence >= 70 ? 'bg-emerald-500' :
                      correlation.confidence >= 40 ? 'bg-amber-500' : 'bg-slate-500')} />
                </div>
              </div>

              {/* Identity tags */}
              {correlation.identityTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {correlation.identityTags.map(tag => (
                    <span key={tag} className="text-[11px] px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20 font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Evidence signals */}
              <div className="space-y-2">
                {correlation.signals.map(sig => (
                  <div key={sig.label} className={clsx('flex gap-3 p-3 rounded-lg border text-[11px]',
                    sig.positive ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-rose-500/5 border-rose-500/15')}>
                    <div className={clsx('mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                      sig.positive ? 'bg-emerald-400' : 'bg-rose-400')} />
                    <div>
                      <p className={clsx('font-semibold', sig.positive ? 'text-emerald-400' : 'text-rose-400')}>{sig.label}</p>
                      <p className="text-slate-500 mt-0.5 leading-relaxed">{sig.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Manual steps */}
              <div className="pt-2 border-t border-wire-1 space-y-1 text-[11px] text-slate-600">
                <p className="font-semibold uppercase tracking-wider mb-1.5">Increase confidence manually</p>
                <p>→ Compare profile photos across found platforms</p>
                <p>→ Check for consistent bio/description text</p>
                <p>→ Look for cross-links between accounts (bio links)</p>
                <p>→ Compare join dates and activity patterns</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            {/* Controls bar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Stats */}
              <div className="flex gap-2">
                {[
                  { label: 'Confirmed', value: found.length, color: 'text-emerald-400' },
                  { label: 'Unverifiable', value: uncertain.length, color: 'text-amber-400' },
                  { label: 'Checked', value: checked.length, color: 'text-slate-400' },
                  { label: 'Pending', value: total - results.length, color: 'text-orange-400' },
                ].map(s => s.value > 0 || s.label === 'Confirmed' || s.label === 'Checked' ? (
                  <div key={s.label} className="card-surface px-3 py-1.5 text-center min-w-[60px]">
                    <p className={clsx('text-base font-bold leading-none', s.color)}>{s.value}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{s.label}</p>
                  </div>
                ) : null)}
              </div>

              {/* Category filter pills */}
              <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                <button onClick={() => setActiveFilter(null)}
                  className={clsx('text-[11px] px-2 py-1 rounded border transition-colors',
                    !activeFilter ? 'bg-orange-500/15 border-orange-500/30 text-orange-300' : 'border-wire-2 text-slate-500 hover:text-slate-300')}>
                  All
                </button>
                {allCats.map(cat => {
                  const cfg = CAT_CONFIG[cat]
                  const catFound = checked.filter(r => r.category === cat && r.found).length
                  if (!catFound) return null
                  return (
                    <button key={cat} onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
                      className={clsx('text-[11px] px-2 py-1 rounded border transition-colors',
                        activeFilter === cat ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'border-wire-2 text-slate-500 hover:text-slate-300')}>
                      {cfg?.label ?? cat} ({catFound})
                    </button>
                  )
                })}
              </div>

              {/* Action buttons */}
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setShowNotFound(v => !v)}
                  className={clsx('text-[11px] px-2.5 py-1.5 rounded border transition-colors',
                    showNotFound ? 'bg-wire-2 border-wire-3 text-slate-300' : 'border-wire-2 text-slate-500 hover:text-slate-300')}>
                  {showNotFound ? 'Hide' : 'Show'} not found
                </button>
                <button onClick={() => navigator.clipboard.writeText(found.map(r => r.url).join('\n'))}
                  title="Copy confirmed account URLs only"
                  className="text-[11px] px-2.5 py-1.5 rounded border border-wire-2 text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
                  <Copy size={11} /> Copy URLs
                </button>
                {done && (
                  <button onClick={exportResults}
                    className="text-[11px] px-2.5 py-1.5 rounded border border-wire-2 text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
                    <Download size={11} /> Export
                  </button>
                )}
              </div>
            </div>

            {/* Category result sections */}
            <div className="space-y-2">
              {Object.entries(catGroups).map(([cat, catResults]) => (
                <CategorySection key={cat} cat={cat} results={catResults}
                  collapsed={collapsedCats.has(cat)}
                  onToggle={() => setCollapsedCats(prev => {
                    const next = new Set(prev)
                    next.has(cat) ? next.delete(cat) : next.add(cat)
                    return next
                  })} />
              ))}
              {Object.keys(catGroups).length === 0 && !running && uncertain.length === 0 && (
                <div className="card-surface p-6 text-center">
                  <AlertCircle size={20} className="text-slate-700 mx-auto mb-2" />
                  <p className="text-[13px] text-slate-500">No accounts found yet.</p>
                </div>
              )}
              <UncertainSection
                sites={uncertain}
                collapsed={uncertainCollapsed}
                onToggle={() => setUncertainCollapsed(v => !v)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!running && results.length === 0 && (
        <div className="card-surface py-16 flex flex-col items-center gap-3 text-center">
          <Users size={36} className="text-slate-700" />
          <p className="text-[13px] text-slate-500">Enter a username to hunt across 200+ platforms.</p>
          <p className="text-[12px] text-slate-700">Requires the CyberWeb backend to be running on port 3001.</p>
        </div>
      )}
    </div>
  )
}
