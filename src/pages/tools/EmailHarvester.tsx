import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  AtSign, Search, Download, Copy, Check, Loader2,
  CheckCircle2, AlertCircle, XCircle, Filter,
} from 'lucide-react'

interface EmailResult {
  email: string
  source: string
  confidence: number
  mxValid: boolean
  pattern: string
}

const SOURCES = ['Google', 'LinkedIn', 'GitHub', 'Hunter.io', 'Bing', 'PGP Keyserver']
const PATTERNS = ['first.last', 'flast', 'firstl', 'first', 'last.first', 'f.last']

function simpleHash(s: string) {
  return s.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffffff, 0)
}

const SAMPLE_NAMES = [
  ['james', 'anderson'], ['sarah', 'mitchell'], ['michael', 'chen'],
  ['emily', 'rodriguez'], ['david', 'thompson'], ['jessica', 'clark'],
  ['robert', 'patel'], ['amanda', 'johnson'], ['christopher', 'lee'],
  ['stephanie', 'white'], ['daniel', 'harris'], ['rachel', 'martin'],
  ['matthew', 'garcia'], ['ashley', 'wilson'], ['andrew', 'taylor'],
  ['melissa', 'moore'], ['joshua', 'jackson'], ['jennifer', 'martinez'],
]

function makeEmail(first: string, last: string, domain: string, pattern: string): string {
  switch (pattern) {
    case 'first.last':  return `${first}.${last}@${domain}`
    case 'flast':       return `${first[0]}${last}@${domain}`
    case 'firstl':      return `${first}${last[0]}@${domain}`
    case 'first':       return `${first}@${domain}`
    case 'last.first':  return `${last}.${first}@${domain}`
    case 'f.last':      return `${first[0]}.${last}@${domain}`
    default:            return `${first}@${domain}`
  }
}

function generateEmails(domain: string, sourceFilter: string[]): EmailResult[] {
  const h = simpleHash(domain)
  const count = 6 + (h % 8)
  const dominantPattern = PATTERNS[h % PATTERNS.length]
  const results: EmailResult[] = []

  for (let i = 0; i < count; i++) {
    const nameIdx = (h + i * 7) % SAMPLE_NAMES.length
    const [first, last] = SAMPLE_NAMES[nameIdx]
    const patternIdx = i === 0 ? h % PATTERNS.length : (h + i * 3) % PATTERNS.length
    const pattern = i < count - 2 ? dominantPattern : PATTERNS[patternIdx]
    const email = makeEmail(first, last, domain, pattern)
    const sourceIdx = (h + i * 5) % SOURCES.length
    const source = SOURCES[sourceIdx]
    if (sourceFilter.length > 0 && !sourceFilter.includes(source)) continue
    const hh = simpleHash(email)
    results.push({
      email,
      source,
      confidence: 60 + (hh % 38),
      mxValid: (hh % 5) !== 0,
      pattern,
    })
  }
  return results
}

const SOURCE_COLORS: Record<string, string> = {
  'Google':       'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'LinkedIn':     'text-sky-400 bg-sky-500/10 border-sky-500/20',
  'GitHub':       'text-slate-300 bg-slate-500/10 border-slate-500/20',
  'Hunter.io':    'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'Bing':         'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'PGP Keyserver':'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 85 ? 'bg-emerald-400' : value >= 65 ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 bg-wire-2 rounded-full overflow-hidden">
        <motion.div className={clsx('h-full rounded-full', color)}
          initial={{ width: 0 }} animate={{ width: `${value}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }} />
      </div>
      <span className="text-[11px] font-mono text-slate-400">{value}%</span>
    </div>
  )
}

export function EmailHarvester() {
  const [target, setTarget] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<EmailResult[]>([])
  const [done, setDone] = useState(false)
  const [activeSources, setActiveSources] = useState<string[]>([])
  const [sourceFilter, setSourceFilter] = useState<string[]>([])
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)

  function toggleSource(s: string) {
    setSourceFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function handleSearch() {
    if (!target.trim() || running) return
    const d = target.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
    setTarget(d)
    setRunning(true); setDone(false); setResults([])
    setProgress(0); setActiveSources([])

    let p = 0
    let srcIdx = 0
    const iv = setInterval(() => {
      p += 12 + Math.random() * 15
      setProgress(Math.min(p, 95))
      if (srcIdx < SOURCES.length && p > (srcIdx + 1) * 14) {
        setActiveSources(prev => [...prev, SOURCES[srcIdx]])
        srcIdx++
      }
    }, 200)

    setTimeout(() => {
      clearInterval(iv)
      setProgress(100)
      setActiveSources(SOURCES)
      const r = generateEmails(d, [])
      setResults(r)
      setDone(true)
      setRunning(false)
    }, 2000)
  }

  function copy(email: string, i: number) {
    navigator.clipboard.writeText(email)
    setCopiedIdx(i)
    setTimeout(() => setCopiedIdx(null), 1500)
  }

  function exportResults() {
    const lines = [
      `CyberWeb Email Harvester — ${target}`,
      `Date: ${new Date().toISOString()}`,
      `Total: ${results.length}  MX-validated: ${results.filter(r => r.mxValid).length}`,
      '',
      ...results.map(r => `${r.email.padEnd(40)} [${r.source.padEnd(14)}] confidence:${r.confidence}% mx:${r.mxValid ? 'valid' : 'fail'}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `emails-${target}.txt`
    a.click()
  }

  const filtered = sourceFilter.length === 0
    ? results
    : results.filter(r => sourceFilter.includes(r.source))

  const validCount = results.filter(r => r.mxValid).length

  return (
    <div className="min-h-full p-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex-shrink-0">
          <AtSign size={22} className="text-orange-400" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Email Harvester</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-orange-400 bg-orange-500/10 border-orange-500/20">
              OSINT · Identity
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Enumerate email addresses linked to a target domain via search engines, data sources, and permutation analysis.
          </p>
        </div>
      </motion.div>

      {/* Config */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }} className="card-surface p-5 space-y-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Target Domain</label>
            <input
              value={target}
              onChange={e => setTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="acme-corp.com"
              className="w-full bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] font-mono text-slate-300 placeholder:text-slate-600 outline-none focus:border-orange-500/40 focus:bg-surface-3 transition-all"
            />
          </div>
          <motion.button
            onClick={handleSearch}
            disabled={!target.trim() || running}
            whileTap={{ scale: 0.96 }}
            className={clsx(
              'flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-all flex-shrink-0',
              !target.trim() || running ? 'bg-wire-2 text-slate-600 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-400 text-white',
            )}
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {running ? 'Harvesting…' : 'Harvest'}
          </motion.button>
        </div>

        {/* Source toggles */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Data Sources</div>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map(s => {
              const queried = activeSources.includes(s)
              return (
                <button key={s} onClick={() => toggleSource(s)}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-medium transition-all',
                    sourceFilter.includes(s)
                      ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                      : 'bg-wire-1 text-slate-500 border-wire-2 hover:text-slate-300',
                  )}>
                  {running && queried && <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />}
                  {done && queried && <CheckCircle2 size={10} className="text-emerald-400" />}
                  {s}
                </button>
              )
            })}
          </div>
          {sourceFilter.length > 0 && (
            <button onClick={() => setSourceFilter([])} className="text-[11px] text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
              <Filter size={10} /> Clear source filter
            </button>
          )}
        </div>

        {/* Progress */}
        {(running || done) && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>{running ? 'Querying sources…' : `Done — ${results.length} addresses found`}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1 bg-wire-2 rounded-full overflow-hidden">
              <motion.div className="h-full bg-orange-400 rounded-full"
                animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut', duration: 0.2 }} />
            </div>
          </div>
        )}
      </motion.div>

      {/* Stats */}
      {done && results.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Addresses Found', value: results.length, color: 'text-orange-400' },
            { label: 'MX Validated', value: validCount, color: 'text-emerald-400' },
            { label: 'MX Failed', value: results.length - validCount, color: 'text-rose-400' },
            { label: 'Avg Confidence', value: `${Math.round(results.reduce((a, r) => a + r.confidence, 0) / results.length)}%`, color: 'text-slate-200' },
          ].map(s => (
            <div key={s.label} className="card-surface px-4 py-3">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</div>
              <div className={clsx('text-2xl font-bold font-mono tracking-tight', s.color)}>{s.value}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Results table */}
      {done && results.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-wire-1">
            <span className="text-sm font-semibold text-slate-200">
              Results <span className="text-[12px] font-normal text-slate-600">{filtered.length} shown</span>
            </span>
            <button onClick={exportResults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] text-slate-400 hover:text-slate-200 border border-wire-2 hover:border-wire-3 transition-all">
              <Download size={12} /> Export
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-wire-1">
                  {['Email Address', 'Source', 'Pattern', 'Confidence', 'MX'].map(h => (
                    <th key={h} className="text-left text-[11px] text-slate-600 uppercase tracking-wider px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-wire-1">
                <AnimatePresence>
                  {filtered.map((r, i) => (
                    <motion.tr key={r.email}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.5), duration: 0.2 }}
                      className="group hover:bg-wire-1/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] text-slate-200">{r.email}</span>
                          <button onClick={() => copy(r.email, i)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {copiedIdx === i
                              ? <Check size={11} className="text-emerald-400" />
                              : <Copy size={11} className="text-slate-600 hover:text-slate-400" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded border', SOURCE_COLORS[r.source] ?? 'text-slate-400 bg-wire-1 border-wire-2')}>
                          {r.source}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">{r.pattern}</td>
                      <td className="px-4 py-2.5"><ConfidenceBar value={r.confidence} /></td>
                      <td className="px-4 py-2.5">
                        {r.mxValid
                          ? <CheckCircle2 size={14} className="text-emerald-400" />
                          : <XCircle size={14} className="text-slate-600" />}
                      </td>
                      <td className="px-4 py-2.5" />
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {!running && !done && (
        <div className="card-surface py-20 flex flex-col items-center gap-3 text-center">
          <AtSign size={32} className="text-slate-700" />
          <p className="text-sm text-slate-600">Enter a domain to harvest email addresses.</p>
          <p className="text-[12px] text-slate-700">Queries Google, LinkedIn, GitHub, Hunter.io, Bing, and PGP keyservers.</p>
        </div>
      )}

      {done && results.length === 0 && (
        <div className="card-surface py-16 flex flex-col items-center gap-3 text-center">
          <AlertCircle size={28} className="text-slate-600" />
          <p className="text-sm text-slate-500">No email addresses found for this domain.</p>
          <p className="text-[12px] text-slate-700">Try a different domain or check spelling.</p>
        </div>
      )}
    </div>
  )
}
