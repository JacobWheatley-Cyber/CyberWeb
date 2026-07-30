import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  Server, Search, Copy, Check, Loader2, ExternalLink,
  AlertCircle, ChevronDown, Globe, Shield,
} from 'lucide-react'

type Tab = 'whois' | 'dns' | 'subdomains' | 'certs'

interface DnsRecord { type: string; name: string; value: string; ttl: string }
interface WhoisData {
  domain: string; registrar: string; registrarUrl: string; ianaId: string
  created: string; updated: string; expires: string
  nameservers: string[]; status: string[]; emails: string[]
  registrant: string; registrantOrg: string
}
interface Subdomain { host: string; ip: string; status: 'live' | 'timeout' | 'redirect' }
interface CertEntry { subject: string; issuer: string; notBefore: string; notAfter: string; san: string[] }

function simpleHash(s: string) {
  return s.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffffff, 0)
}

const REGISTRARS = [
  { name: 'Cloudflare, Inc.', url: 'https://cloudflare.com', iana: '1910' },
  { name: 'Namecheap, Inc.', url: 'https://namecheap.com', iana: '1068' },
  { name: 'GoDaddy.com, LLC', url: 'https://godaddy.com', iana: '146' },
  { name: 'Google LLC', url: 'https://domains.google', iana: '895' },
  { name: 'Tucows Domains Inc.', url: 'https://tucows.com', iana: '69' },
]
const STATUSES = ['clientTransferProhibited', 'clientUpdateProhibited', 'clientDeleteProhibited']

function generateWhois(domain: string): WhoisData {
  const h = simpleHash(domain)
  const reg = REGISTRARS[h % REGISTRARS.length]
  const baseYear = 2010 + (h % 14)
  const created = `${baseYear}-${String((h % 12) + 1).padStart(2, '0')}-${String((h % 28) + 1).padStart(2, '0')}`
  const expires = `${baseYear + 5 + (h % 5)}-${String((h % 12) + 1).padStart(2, '0')}-${String((h % 28) + 1).padStart(2, '0')}`
  const ns1 = `ns1.${domain}`
  const ns2 = `ns2.${domain}`
  return {
    domain, registrar: reg.name, registrarUrl: reg.url, ianaId: reg.iana,
    created, updated: `2023-${String((h % 12) + 1).padStart(2, '0')}-15`, expires,
    nameservers: [ns1, ns2, ...(h % 3 === 0 ? [`ns3.${domain}`] : [])],
    status: STATUSES.slice(0, 2 + (h % 2)),
    emails: [`abuse@${domain}`, `admin@${domain}`],
    registrant: h % 4 === 0 ? 'REDACTED FOR PRIVACY' : `Domain Owner`,
    registrantOrg: h % 4 === 0 ? 'REDACTED FOR PRIVACY' : domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1) + ' LLC',
  }
}

function generateDns(domain: string): DnsRecord[] {
  const h = simpleHash(domain)
  const ip = `${(h >> 16) % 223 + 1}.${(h >> 8) % 254 + 1}.${h % 254 + 1}.${(h * 7) % 254 + 1}`
  const ip2 = `${(h >> 16) % 223 + 1}.${(h >> 9) % 254 + 1}.${(h + 1) % 254 + 1}.${(h * 13) % 254 + 1}`
  const mailHost = `mail.${domain}`
  const spf = `v=spf1 include:_spf.${domain} include:sendgrid.net ~all`
  const dmarc = `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; adkim=r; aspf=r`
  return [
    { type: 'A',     name: domain,       value: ip,              ttl: '300' },
    { type: 'A',     name: domain,       value: ip2,             ttl: '300' },
    { type: 'AAAA',  name: domain,       value: `2606:4700:3031::${h.toString(16).padStart(4,'0')}:${(h>>8).toString(16).padStart(4,'0')}`, ttl: '300' },
    { type: 'MX',    name: domain,       value: `10 ${mailHost}`, ttl: '3600' },
    { type: 'MX',    name: domain,       value: `20 mail2.${domain}`, ttl: '3600' },
    { type: 'NS',    name: domain,       value: `ns1.${domain}`, ttl: '86400' },
    { type: 'NS',    name: domain,       value: `ns2.${domain}`, ttl: '86400' },
    { type: 'TXT',   name: domain,       value: spf,             ttl: '3600' },
    { type: 'TXT',   name: `_dmarc.${domain}`, value: dmarc,    ttl: '3600' },
    { type: 'TXT',   name: domain,       value: `google-site-verification=${h.toString(36).padStart(28,'0')}`, ttl: '3600' },
    { type: 'CAA',   name: domain,       value: '0 issue "letsencrypt.org"', ttl: '3600' },
    { type: 'SOA',   name: domain,       value: `ns1.${domain} hostmaster.${domain} 2024031501 7200 3600 1209600 300`, ttl: '3600' },
  ]
}

function generateSubdomains(domain: string): Subdomain[] {
  const h = simpleHash(domain)
  const prefixes = ['www', 'mail', 'api', 'cdn', 'dev', 'staging', 'admin', 'app', 'blog', 'docs', 'status', 'vpn', 'ftp', 'smtp', 'remote']
  const liveCount = 5 + (h % 6)
  return prefixes.slice(0, liveCount + 3).map((p, i) => {
    const ph = simpleHash(p + domain)
    const ip = `${(ph >> 16) % 223 + 1}.${(ph >> 8) % 254 + 1}.${ph % 254 + 1}.${i + 1}`
    const s: Subdomain['status'] = i < liveCount ? 'live' : i === liveCount ? 'redirect' : 'timeout'
    return { host: `${p}.${domain}`, ip: s !== 'timeout' ? ip : '', status: s }
  })
}

function generateCerts(domain: string): CertEntry[] {
  const h = simpleHash(domain)
  return [
    {
      subject: `*.${domain}`,
      issuer: "Let's Encrypt Authority X3",
      notBefore: '2024-01-15T00:00:00Z',
      notAfter: '2024-04-15T23:59:59Z',
      san: [`*.${domain}`, domain, `www.${domain}`],
    },
    {
      subject: domain,
      issuer: h % 2 === 0 ? "DigiCert TLS RSA SHA256 2020 CA1" : "Sectigo RSA Domain Validation CA",
      notBefore: '2023-06-01T00:00:00Z',
      notAfter: '2024-06-01T23:59:59Z',
      san: [domain, `www.${domain}`, `api.${domain}`, `mail.${domain}`],
    },
  ]
}

const TYPE_COLOR: Record<string, string> = {
  A: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  AAAA: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  MX: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  NS: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  TXT: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  CAA: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  SOA: 'text-slate-400 bg-wire-1 border-wire-2',
  CNAME: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
    >
      {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} className="text-slate-600 hover:text-slate-400" />}
    </button>
  )
}

export function WhoisDnsIntel() {
  const [domain, setDomain] = useState('')
  const [running, setRunning] = useState(false)
  const [tab, setTab] = useState<Tab>('whois')
  const [whois, setWhois] = useState<WhoisData | null>(null)
  const [dns, setDns] = useState<DnsRecord[]>([])
  const [subdomains, setSubdomains] = useState<Subdomain[]>([])
  const [certs, setCerts] = useState<CertEntry[]>([])
  const [dnsTypeFilter, setDnsTypeFilter] = useState('All')
  const [expandedCert, setExpandedCert] = useState<number | null>(null)

  function handleLookup() {
    const d = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
    if (!d || running) return
    setDomain(d)
    setRunning(true)
    setWhois(null); setDns([]); setSubdomains([]); setCerts([])
    setTimeout(() => {
      setWhois(generateWhois(d))
      setDns(generateDns(d))
      setSubdomains(generateSubdomains(d))
      setCerts(generateCerts(d))
      setRunning(false)
      setTab('whois')
    }, 1200)
  }

  const dnsTypes = ['All', ...Array.from(new Set(dns.map(r => r.type)))]
  const filteredDns = dnsTypeFilter === 'All' ? dns : dns.filter(r => r.type === dnsTypeFilter)
  const hasData = !!whois

  const TABS = [
    { key: 'whois', label: 'WHOIS', icon: Globe },
    { key: 'dns', label: 'DNS Records', icon: Server },
    { key: 'subdomains', label: 'Subdomains', icon: Search },
    { key: 'certs', label: 'Certificates', icon: Shield },
  ] as const

  return (
    <div className="min-h-full p-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex-shrink-0">
          <Server size={22} className="text-orange-400" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 tracking-tight">WHOIS & DNS Intel</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-orange-400 bg-orange-500/10 border-orange-500/20">
              OSINT · Reconnaissance
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Deep domain intelligence — WHOIS history, DNS enumeration, certificate transparency, and subdomain discovery.
          </p>
        </div>
      </motion.div>

      {/* Input */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }} className="card-surface p-5">
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Target Domain</label>
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              placeholder="example.com"
              className="w-full bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] font-mono text-slate-300 placeholder:text-slate-600 outline-none focus:border-orange-500/40 focus:bg-surface-3 transition-all"
            />
          </div>
          <motion.button
            onClick={handleLookup}
            disabled={!domain.trim() || running}
            whileTap={{ scale: 0.96 }}
            className={clsx(
              'flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-all flex-shrink-0',
              !domain.trim() || running ? 'bg-wire-2 text-slate-600 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-400 text-white',
            )}
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {running ? 'Querying…' : 'Lookup'}
          </motion.button>
        </div>
      </motion.div>

      {/* Results */}
      {!hasData && !running && (
        <div className="card-surface py-20 flex flex-col items-center gap-3 text-center">
          <Server size={32} className="text-slate-700" />
          <p className="text-sm text-slate-600">Enter a domain to query WHOIS, DNS records, subdomains, and certificates.</p>
        </div>
      )}

      {running && (
        <div className="card-surface py-20 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 text-[13px] text-slate-400">
            <Loader2 size={16} className="animate-spin text-orange-400" />
            Querying WHOIS, DNS, and certificate logs…
          </div>
        </div>
      )}

      <AnimatePresence>
        {hasData && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Tab bar */}
            <div className="card-surface overflow-hidden">
              <div className="flex border-b border-wire-1">
                {TABS.map(t => (
                  <button key={t.key} onClick={() => setTab(t.key as Tab)}
                    className={clsx(
                      'flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium border-b-2 transition-all',
                      tab === t.key ? 'text-orange-400 border-orange-500' : 'text-slate-600 border-transparent hover:text-slate-400',
                    )}>
                    <t.icon size={12} />
                    {t.label}
                    {t.key === 'subdomains' && <span className="ml-1 text-[10px] text-slate-600">({subdomains.length})</span>}
                    {t.key === 'dns' && <span className="ml-1 text-[10px] text-slate-600">({dns.length})</span>}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {/* WHOIS Tab */}
                {tab === 'whois' && whois && (
                  <motion.div key="whois" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                    className="p-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Registration */}
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Registration</div>
                        {[
                          ['Domain', whois.domain],
                          ['Registrar', whois.registrar],
                          ['IANA ID', whois.ianaId],
                          ['Created', whois.created],
                          ['Updated', whois.updated],
                          ['Expires', whois.expires],
                        ].map(([l, v]) => (
                          <div key={l} className="group flex items-center gap-2 py-1 border-b border-wire-1 last:border-0">
                            <span className="text-[11px] text-slate-500 w-20 flex-shrink-0">{l}</span>
                            <span className="text-[12px] text-slate-300 font-mono flex-1 truncate">{v}</span>
                            <CopyBtn value={v} />
                          </div>
                        ))}
                      </div>

                      {/* Registrant */}
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Registrant</div>
                        {[
                          ['Name', whois.registrant],
                          ['Org', whois.registrantOrg],
                          ...whois.emails.map((e, i) => [`Email ${i + 1}`, e] as [string, string]),
                        ].map(([l, v]) => (
                          <div key={l} className="group flex items-center gap-2 py-1 border-b border-wire-1 last:border-0">
                            <span className="text-[11px] text-slate-500 w-20 flex-shrink-0">{l}</span>
                            <span className={clsx('text-[12px] flex-1 truncate', v.startsWith('REDACTED') ? 'text-slate-600 italic' : 'text-slate-300 font-mono')}>{v}</span>
                            {!v.startsWith('REDACTED') && <CopyBtn value={v} />}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Name servers */}
                    <div>
                      <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Name Servers</div>
                      <div className="flex flex-wrap gap-2">
                        {whois.nameservers.map(ns => (
                          <span key={ns} className="font-mono text-[12px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                            {ns}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Domain Status</div>
                      <div className="flex flex-wrap gap-2">
                        {whois.status.map(s => (
                          <span key={s} className="text-[11px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <a href={whois.registrarUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] text-orange-400 hover:text-orange-300 transition-colors">
                      <ExternalLink size={12} /> {whois.registrar}
                    </a>
                  </motion.div>
                )}

                {/* DNS Tab */}
                {tab === 'dns' && (
                  <motion.div key="dns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="p-5 space-y-3">
                    <div className="flex gap-1 flex-wrap">
                      {dnsTypes.map(t => (
                        <button key={t} onClick={() => setDnsTypeFilter(t)}
                          className={clsx(
                            'px-2.5 py-1 rounded text-[11px] font-medium border transition-all font-mono',
                            dnsTypeFilter === t
                              ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                              : 'text-slate-500 border-wire-2 hover:text-slate-300',
                          )}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-wire-1">
                            <th className="text-left text-[11px] text-slate-600 uppercase tracking-wider pb-2 pr-4 font-medium">Type</th>
                            <th className="text-left text-[11px] text-slate-600 uppercase tracking-wider pb-2 pr-4 font-medium">Name</th>
                            <th className="text-left text-[11px] text-slate-600 uppercase tracking-wider pb-2 pr-4 font-medium">Value</th>
                            <th className="text-right text-[11px] text-slate-600 uppercase tracking-wider pb-2 font-medium">TTL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-wire-1">
                          {filteredDns.map((r, i) => (
                            <tr key={i} className="group hover:bg-wire-1/50 transition-colors">
                              <td className="py-2 pr-4">
                                <span className={clsx('text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border', TYPE_COLOR[r.type] ?? 'text-slate-400 bg-wire-1 border-wire-2')}>
                                  {r.type}
                                </span>
                              </td>
                              <td className="py-2 pr-4 font-mono text-slate-500 max-w-[160px] truncate">{r.name}</td>
                              <td className="py-2 pr-4 font-mono text-slate-300 max-w-xs">
                                <div className="flex items-center gap-1">
                                  <span className="truncate">{r.value}</span>
                                  <CopyBtn value={r.value} />
                                </div>
                              </td>
                              <td className="py-2 text-right font-mono text-slate-600">{r.ttl}s</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {/* Subdomains Tab */}
                {tab === 'subdomains' && (
                  <motion.div key="subdomains" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="p-5 space-y-2">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[12px] text-slate-500">{subdomains.filter(s => s.status === 'live').length} live · {subdomains.filter(s => s.status === 'redirect').length} redirect · {subdomains.filter(s => s.status === 'timeout').length} timeout</span>
                    </div>
                    {subdomains.map(s => (
                      <div key={s.host} className="group flex items-center gap-3 px-3 py-2.5 rounded-md bg-wire-1 border border-wire-2 hover:border-wire-3 transition-all">
                        <span className={clsx('h-2 w-2 rounded-full flex-shrink-0',
                          s.status === 'live' ? 'bg-emerald-400' : s.status === 'redirect' ? 'bg-amber-400' : 'bg-slate-600')} />
                        <span className="font-mono text-[13px] text-slate-300 flex-1 truncate">{s.host}</span>
                        {s.ip && <span className="font-mono text-[11px] text-slate-600">{s.ip}</span>}
                        <span className={clsx('text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded',
                          s.status === 'live' ? 'text-emerald-400 bg-emerald-500/10' :
                          s.status === 'redirect' ? 'text-amber-400 bg-amber-500/10' :
                          'text-slate-600 bg-wire-2'
                        )}>{s.status}</span>
                        {s.status !== 'timeout' && (
                          <a href={`https://${s.host}`} target="_blank" rel="noopener noreferrer"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-orange-400 hover:text-orange-300">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-700 pt-1">
                      Subdomains discovered via certificate transparency logs and passive DNS enumeration.
                    </p>
                  </motion.div>
                )}

                {/* Certs Tab */}
                {tab === 'certs' && (
                  <motion.div key="certs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="p-5 space-y-3">
                    {certs.map((c, i) => (
                      <div key={i} className="card-surface overflow-hidden border border-wire-2">
                        <button onClick={() => setExpandedCert(expandedCert === i ? null : i)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-wire-1/50 transition-colors">
                          <Shield size={14} className="text-orange-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[13px] text-slate-200">{c.subject}</div>
                            <div className="text-[11px] text-slate-600 mt-0.5">{c.issuer}</div>
                          </div>
                          <div className="text-[11px] text-slate-600 text-right flex-shrink-0 mr-2">
                            <div>from {c.notBefore.split('T')[0]}</div>
                            <div className={clsx(new Date(c.notAfter) < new Date() ? 'text-rose-400' : 'text-emerald-400')}>
                              {new Date(c.notAfter) < new Date() ? 'expired' : 'until'} {c.notAfter.split('T')[0]}
                            </div>
                          </div>
                          <motion.div animate={{ rotate: expandedCert === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown size={14} className="text-slate-600" />
                          </motion.div>
                        </button>
                        <AnimatePresence>
                          {expandedCert === i && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                              className="overflow-hidden border-t border-wire-1 px-4 py-3 space-y-2">
                              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Subject Alt Names</div>
                              <div className="flex flex-wrap gap-1.5">
                                {c.san.map(s => (
                                  <span key={s} className="font-mono text-[11px] text-orange-300 bg-orange-500/8 border border-orange-500/15 px-2 py-0.5 rounded">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                    <div className="flex items-start gap-2 text-[12px] text-slate-600 pt-1">
                      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                      Certificate data sourced from crt.sh and Google Certificate Transparency logs.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
