import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Database, Search, AlertTriangle, ShieldAlert, Eye, EyeOff, Copy, Check, Download, Calendar, Users, Key, Mail } from 'lucide-react'
import clsx from 'clsx'

function simpleHash(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i)
  return Math.abs(h)
}

interface BreachRecord {
  id: string
  name: string
  domain: string
  breachDate: string
  addedDate: string
  pwnCount: number
  dataClasses: string[]
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  verified: boolean
  isFabricated: boolean
  isSensitive: boolean
}

interface PasteRecord {
  id: string
  source: string
  title: string
  date: string
  emailCount: number
  excerpt: string
}

const BREACH_TEMPLATES = [
  {
    name: 'DataLeakHub', domain: 'dataleakhub.com',
    dataClasses: ['Email addresses', 'Passwords', 'Usernames', 'IP addresses'],
    description: 'In 2021, a large data aggregation site suffered a breach exposing millions of compiled records from other breaches.',
    severity: 'critical' as const, verified: true, isFabricated: false, isSensitive: false,
  },
  {
    name: 'ForumHub', domain: 'forumhub.net',
    dataClasses: ['Email addresses', 'Usernames', 'Passwords', 'Dates of birth'],
    description: 'A popular online forum was compromised, exposing hashed passwords and user profile data.',
    severity: 'high' as const, verified: true, isFabricated: false, isSensitive: false,
  },
  {
    name: 'ShopBreached', domain: 'shopbreached.com',
    dataClasses: ['Email addresses', 'Names', 'Physical addresses', 'Payment card data'],
    description: 'An e-commerce platform was breached, exposing customer PII and partial payment information.',
    severity: 'critical' as const, verified: true, isFabricated: false, isSensitive: true,
  },
  {
    name: 'SocialDump', domain: 'socialdump.io',
    dataClasses: ['Email addresses', 'Phone numbers', 'Usernames', 'Geographic locations'],
    description: 'Scraped data from a major social network was publicly released, containing profile information.',
    severity: 'medium' as const, verified: true, isFabricated: false, isSensitive: false,
  },
  {
    name: 'GamersLeaked', domain: 'gamersleaked.gg',
    dataClasses: ['Email addresses', 'Usernames', 'Passwords', 'Game stats'],
    description: 'A gaming community site had its database exfiltrated by an unknown threat actor.',
    severity: 'high' as const, verified: true, isFabricated: false, isSensitive: false,
  },
  {
    name: 'HealthPortal', domain: 'healthportal.org',
    dataClasses: ['Email addresses', 'Names', 'Dates of birth', 'Medical conditions', 'Insurance IDs'],
    description: 'A healthcare patient portal suffered an intrusion, exposing sensitive personal health information.',
    severity: 'critical' as const, verified: true, isFabricated: false, isSensitive: true,
  },
  {
    name: 'CloudStorage', domain: 'cloudstorage.co',
    dataClasses: ['Email addresses', 'Passwords', 'File metadata'],
    description: 'A cloud file storage service exposed user credentials and file metadata through a misconfigured API.',
    severity: 'high' as const, verified: true, isFabricated: false, isSensitive: false,
  },
  {
    name: 'TechForum', domain: 'techforum.dev',
    dataClasses: ['Email addresses', 'Usernames', 'IP addresses'],
    description: 'A developer community forum exposed account information through an unprotected database endpoint.',
    severity: 'low' as const, verified: true, isFabricated: false, isSensitive: false,
  },
]

const PASTE_SOURCES = ['Pastebin', 'GitHub Gists', 'Ghostbin', 'JustPaste.it', 'Hastebin']

function generateBreaches(query: string): BreachRecord[] {
  const hash = simpleHash(query)
  const count = 2 + (hash % 5)
  const results: BreachRecord[] = []
  const used = new Set<number>()

  for (let i = 0; i < count; i++) {
    let idx = simpleHash(query + i) % BREACH_TEMPLATES.length
    while (used.has(idx)) idx = (idx + 1) % BREACH_TEMPLATES.length
    used.add(idx)

    const t = BREACH_TEMPLATES[idx]
    const yearOffset = hash % 5
    const year = 2019 + yearOffset
    const month = String(1 + (simpleHash(query + i + 'mo') % 12)).padStart(2, '0')
    const day = String(1 + (simpleHash(query + i + 'dy') % 28)).padStart(2, '0')
    const pwnBase = 50000 + (simpleHash(query + i + 'pwn') % 49950000)

    results.push({
      id: `breach-${i}`,
      name: t.name,
      domain: t.domain,
      breachDate: `${year}-${month}-${day}`,
      addedDate: `${year + 1}-01-15`,
      pwnCount: pwnBase,
      dataClasses: t.dataClasses,
      description: t.description,
      severity: t.severity,
      verified: t.verified,
      isFabricated: t.isFabricated,
      isSensitive: t.isSensitive,
    })
  }
  return results
}

function generatePastes(query: string): PasteRecord[] {
  const hash = simpleHash(query)
  const hasPastes = hash % 3 !== 0
  if (!hasPastes) return []
  const count = 1 + (hash % 3)
  const results: PasteRecord[] = []

  for (let i = 0; i < count; i++) {
    const srcIdx = simpleHash(query + i + 'src') % PASTE_SOURCES.length
    const year = 2020 + (simpleHash(query + i + 'yr') % 4)
    const month = String(1 + (simpleHash(query + i + 'mn') % 12)).padStart(2, '0')
    results.push({
      id: `paste-${i}`,
      source: PASTE_SOURCES[srcIdx],
      title: `Leaked credentials dump #${simpleHash(query + i) % 9000 + 1000}`,
      date: `${year}-${month}-01`,
      emailCount: 50 + (simpleHash(query + i + 'ct') % 950),
      excerpt: `...${query}:$2y$10$${simpleHash(query + i).toString(16).slice(0, 12)}... [+${100 + (simpleHash(query + i + 'ex') % 400)} more lines]`,
    })
  }
  return results
}

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', class: 'bg-red-500/15 text-red-400 border-red-500/30', bar: 'bg-red-500', dot: 'bg-red-400' },
  high:     { label: 'High',     class: 'bg-orange-500/15 text-orange-400 border-orange-500/30', bar: 'bg-orange-500', dot: 'bg-orange-400' },
  medium:   { label: 'Medium',   class: 'bg-amber-500/15 text-amber-400 border-amber-500/30', bar: 'bg-amber-500', dot: 'bg-amber-400' },
  low:      { label: 'Low',      class: 'bg-blue-500/15 text-blue-400 border-blue-500/30', bar: 'bg-blue-500', dot: 'bg-blue-400' },
}

const DATA_CLASS_ICONS: Record<string, React.ReactNode> = {
  'Email addresses': <Mail size={11} />,
  'Passwords': <Key size={11} />,
  'Names': <Users size={11} />,
  'Phone numbers': <Users size={11} />,
  'Dates of birth': <Calendar size={11} />,
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-orange-500/10 text-slate-500 hover:text-orange-400">
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  )
}

function RiskScore({ breaches }: { breaches: BreachRecord[] }) {
  const score = Math.min(100, breaches.reduce((acc, b) => {
    return acc + (b.severity === 'critical' ? 30 : b.severity === 'high' ? 20 : b.severity === 'medium' ? 10 : 5)
  }, 0))
  const label = score >= 70 ? 'Critical Risk' : score >= 40 ? 'High Risk' : score >= 20 ? 'Medium Risk' : 'Low Risk'
  const color = score >= 70 ? 'text-red-400' : score >= 40 ? 'text-orange-400' : score >= 20 ? 'text-amber-400' : 'text-blue-400'
  const barColor = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-orange-500' : score >= 20 ? 'bg-amber-500' : 'bg-blue-500'

  return (
    <div className="card-surface p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Exposure Risk</span>
        <span className={clsx('text-sm font-bold', color)}>{label}</span>
      </div>
      <div className="h-2 bg-wire-2 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={clsx('h-full rounded-full', barColor)}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>Score: {score}/100</span>
        <span>{breaches.length} breach{breaches.length !== 1 ? 'es' : ''} found</span>
      </div>
    </div>
  )
}

function BreachCard({ breach }: { breach: BreachRecord }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = SEVERITY_CONFIG[breach.severity]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-surface overflow-hidden"
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-wire-1/50 transition-colors"
      >
        <div className={clsx('mt-0.5 w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-100">{breach.name}</span>
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-semibold', cfg.class)}>{cfg.label}</span>
            {breach.isSensitive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30 font-semibold">Sensitive</span>
            )}
            {breach.verified && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold">Verified</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
            <span>{breach.domain}</span>
            <span>·</span>
            <span>{new Date(breach.breachDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            <span>·</span>
            <span>{breach.pwnCount.toLocaleString()} records</span>
          </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <Eye size={14} className="text-slate-500 flex-shrink-0" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-wire-1 pt-3 space-y-3">
              <p className="text-[12px] text-slate-400 leading-relaxed">{breach.description}</p>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">Compromised Data</p>
                <div className="flex flex-wrap gap-1.5">
                  {breach.dataClasses.map(cls => (
                    <span key={cls} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20">
                      {DATA_CLASS_ICONS[cls] ?? null}
                      {cls}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-500">Breach Date</span>
                  <p className="text-slate-300 mt-0.5">{breach.breachDate}</p>
                </div>
                <div>
                  <span className="text-slate-500">Records Exposed</span>
                  <p className="text-slate-300 mt-0.5">{breach.pwnCount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function PasteCard({ paste }: { paste: PasteRecord }) {
  return (
    <div className="card-surface p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-medium text-slate-200">{paste.title}</p>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
            <span>{paste.source}</span>
            <span>·</span>
            <span>{paste.date}</span>
            <span>·</span>
            <span>{paste.emailCount} emails</span>
          </div>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold flex-shrink-0">Paste</span>
      </div>
      <code className="block text-[11px] text-slate-500 font-mono bg-surface-0 rounded px-2 py-1.5 truncate">{paste.excerpt}</code>
    </div>
  )
}

type Tab = 'breaches' | 'pastes'

export function BreachSearch() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [loading, setLoading] = useState(false)
  const [breaches, setBreaches] = useState<BreachRecord[]>([])
  const [pastes, setPastes] = useState<PasteRecord[]>([])
  const [tab, setTab] = useState<Tab>('breaches')
  const [showRedacted, setShowRedacted] = useState(false)
  const [copied, setCopied] = useState(false)

  const search = () => {
    if (!query.trim()) return
    setLoading(true)
    setBreaches([])
    setPastes([])
    setSubmitted(query.trim())
    setTab('breaches')

    setTimeout(() => {
      setBreaches(generateBreaches(query.trim()))
      setPastes(generatePastes(query.trim()))
      setLoading(false)
    }, 1400)
  }

  const hasResults = breaches.length > 0 || pastes.length > 0

  const exportReport = () => {
    const lines = [
      `Breach Search Report — ${submitted}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      `=== BREACHES (${breaches.length}) ===`,
      ...breaches.map(b => [
        `Name: ${b.name}`,
        `Domain: ${b.domain}`,
        `Date: ${b.breachDate}`,
        `Records: ${b.pwnCount.toLocaleString()}`,
        `Severity: ${b.severity}`,
        `Data: ${b.dataClasses.join(', ')}`,
        '',
      ].join('\n')),
      `=== PASTES (${pastes.length}) ===`,
      ...pastes.map(p => `${p.source} — ${p.title} (${p.emailCount} emails, ${p.date})`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `breach-report-${submitted.replace(/[^a-z0-9]/gi, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyQuery = () => {
    navigator.clipboard.writeText(submitted)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const criticalCount = breaches.filter(b => b.severity === 'critical').length
  const sensitiveCount = breaches.filter(b => b.isSensitive).length
  const totalRecords = breaches.reduce((a, b) => a + b.pwnCount, 0)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <Database size={20} className="text-orange-400" />
          <h1 className="text-xl font-semibold text-slate-100">Breach Search</h1>
        </div>
        <p className="text-[13px] text-slate-500">Search for email addresses, usernames, or domains across known data breaches and paste dumps.</p>
      </div>

      {/* Search bar */}
      <div className="card-surface p-4 space-y-3">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Search Query</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="email@example.com, username, or example.com"
            className="flex-1 bg-surface-0 border border-wire-2 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
          <button
            onClick={search}
            disabled={!query.trim() || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            <Search size={14} />
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        <p className="text-[11px] text-slate-600">Searches simulated breach data for demonstration purposes only.</p>
      </div>

      {/* Loading */}
      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card-surface p-6 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-orange-500/30 border-t-orange-400 animate-spin" />
            <p className="text-[13px] text-slate-400">Querying breach databases…</p>
            <p className="text-[11px] text-slate-600">Checking HIBP, credential dumps, paste sites…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {!loading && hasResults && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Query bar */}
            <div className="flex items-center justify-between">
              <div className="group flex items-center gap-1.5 text-[12px] text-slate-500">
                <span>Results for</span>
                <span className="text-orange-400 font-mono font-medium">{showRedacted ? '••••••••' : submitted}</span>
                <button onClick={copyQuery} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-orange-400">
                  {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
                <button
                  onClick={() => setShowRedacted(r => !r)}
                  className="ml-1 p-0.5 rounded hover:text-orange-400 transition-colors"
                  title={showRedacted ? 'Show query' : 'Redact query'}
                >
                  {showRedacted ? <Eye size={11} /> : <EyeOff size={11} />}
                </button>
              </div>
              <button
                onClick={exportReport}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border border-wire-2 text-slate-400 hover:text-slate-200 hover:border-orange-500/40 transition-colors"
              >
                <Download size={12} /> Export Report
              </button>
            </div>

            {/* Risk score */}
            <RiskScore breaches={breaches} />

            {/* Stats row */}
            {criticalCount > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
                <AlertTriangle size={14} className="flex-shrink-0" />
                <span>
                  {criticalCount} critical breach{criticalCount !== 1 ? 'es' : ''} found
                  {sensitiveCount > 0 && ` including ${sensitiveCount} with sensitive data`}.
                  Immediate credential rotation recommended.
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Breaches', value: breaches.length, color: 'text-orange-400' },
                { label: 'Total Records', value: totalRecords.toLocaleString(), color: 'text-slate-200' },
                { label: 'Paste Leaks', value: pastes.length, color: pastes.length > 0 ? 'text-red-400' : 'text-slate-500' },
              ].map(s => (
                <div key={s.label} className="card-surface p-3">
                  <p className={clsx('text-lg font-bold', s.color)}>{s.value}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-wire-1">
              {(['breaches', 'pastes'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={clsx(
                    'px-3 py-2 text-[12px] font-medium capitalize transition-colors border-b-2 -mb-px',
                    tab === t
                      ? 'border-orange-400 text-orange-400'
                      : 'border-transparent text-slate-500 hover:text-slate-300',
                  )}
                >
                  {t === 'breaches' ? `Breaches (${breaches.length})` : `Paste Leaks (${pastes.length})`}
                </button>
              ))}
            </div>

            {tab === 'breaches' && (
              <div className="space-y-2">
                {breaches.map(b => <BreachCard key={b.id} breach={b} />)}
              </div>
            )}

            {tab === 'pastes' && (
              <div className="space-y-2">
                {pastes.length === 0 ? (
                  <div className="card-surface p-6 text-center text-[13px] text-slate-500">No paste leaks found for this query.</div>
                ) : (
                  pastes.map(p => <PasteCard key={p.id} paste={p} />)
                )}
              </div>
            )}

            {/* Warning footer */}
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400/80">
              <ShieldAlert size={13} className="flex-shrink-0 mt-0.5" />
              <span>This tool uses simulated breach data for UI demonstration only. In production, this would integrate with HIBP, DeHashed, or similar APIs.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!loading && !hasResults && (
        <div className="card-surface p-8 flex flex-col items-center gap-3 text-center">
          <Database size={32} className="text-slate-700" />
          <p className="text-[13px] text-slate-500">Enter an email address, username, or domain to search breach records.</p>
        </div>
      )}
    </div>
  )
}
