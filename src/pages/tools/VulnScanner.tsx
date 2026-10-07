import { useRef, useState } from 'react'
import { Bug, Download, Play, Square } from 'lucide-react'
import { ApiEventSource, describeApiError } from '../../lib/api'
import { csvRow } from '../../lib/csv'
import { SavedTargets } from '../../components/SavedTargets'

type Severity = 'high' | 'medium' | 'low' | 'info'
interface Finding {
  id: number
  ip: string
  hostname: string
  port: number
  service: string
  severity: Severity
  title: string
  description: string
  evidence: string
  remediation: string
  verified: boolean
  cve: null
}

function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const badge: Record<Severity, string> = {
  high: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
  medium: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  low: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  info: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
}

export function VulnScanner() {
  const [target, setTarget] = useState(() => new URLSearchParams(window.location.search).get('target') || '')
  const [mode, setMode] = useState('Standard')
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [phase, setPhase] = useState('')
  const [progress, setProgress] = useState({ scanned: 0, total: 0 })
  const [hosts, setHosts] = useState(0)
  const [findings, setFindings] = useState<Finding[]>([])
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const source = useRef<ApiEventSource | null>(null)

  function stop() {
    source.current?.close()
    source.current = null
    setRunning(false)
    setPhase('Stopped')
  }

  function start() {
    if (!target.trim() || running) return
    source.current?.close()
    setStarted(true)
    setRunning(true)
    setFindings([])
    setHosts(0)
    setProgress({ scanned: 0, total: 0 })
    setError('')
    setPhase('Discovering hosts and open ports')
    const events = new ApiEventSource(`/api/vuln-scan?target=${encodeURIComponent(target.trim())}&mode=${mode}`)
    source.current = events
    events.addEventListener('start', e => {
      const data = JSON.parse(e.data)
      setProgress({ scanned: 0, total: data.total })
    })
    events.addEventListener('progress', e => setProgress(JSON.parse(e.data)))
    events.addEventListener('host_found', () => setHosts(value => value + 1))
    events.addEventListener('phase', () => setPhase('Checking observed services'))
    events.addEventListener('finding', e => setFindings(value => [...value, JSON.parse(e.data)]))
    events.addEventListener('complete', () => {
      setPhase('Complete')
      setRunning(false)
      events.close()
    })
    events.addEventListener('scan_error', e => {
      setError(JSON.parse(e.data).message || 'Scan failed')
      setRunning(false)
      events.close()
    })
    events.onerror = error => {
      setError(describeApiError(error))
      setRunning(false)
      events.close()
    }
  }

  const visible = findings.filter(item => filter === 'all' || item.severity === filter)
  const baseName = `cyberweb-vuln-${target.trim().replace(/[^a-z0-9.-]/gi, '_') || 'scan'}`
  return <div className="min-h-full p-6 space-y-5">
    <div className="flex items-start gap-3">
      <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20"><Bug size={22} className="text-rose-400" /></div>
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Vulnerability Scanner</h1>
        <p className="text-sm text-slate-500">Read-only HTTP, TLS, and Redis checks with evidence for each finding.</p>
      </div>
    </div>

    <div className="card-surface p-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <input value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && start()}
          placeholder="Private IP, hostname, or CIDR up to /22" aria-label="Target"
          className="flex-1 min-w-52 bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-sm text-slate-200" />
        <button onClick={running ? stop : start} disabled={!running && !target.trim()}
          className="flex items-center gap-2 rounded-md bg-rose-500 hover:bg-rose-400 disabled:opacity-40 px-4 py-2 text-sm text-white">
          {running ? <><Square size={14} /> Stop</> : <><Play size={14} /> Scan</>}
        </button>
      </div>
      <SavedTargets currentValue={target} onSelect={setTarget} accentColor="red" />
      <div className="flex gap-2">
        {['Quick', 'Standard', 'Thorough'].map(value => <button key={value} onClick={() => setMode(value)} disabled={running}
          className={`px-3 py-1.5 rounded border text-xs ${mode === value ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-500 border-wire-2'}`}>
          {value}
        </button>)}
      </div>
      <p className="text-xs text-slate-500">The API validates targets and limits scan size. Results describe the root HTTP response, presented TLS certificate, or Redis PING only. They do not prove an exploit or a CVE.</p>
    </div>

    {started && <div className="card-surface p-4 flex flex-wrap items-center gap-4 text-sm text-slate-400">
      <span>{phase}</span><span>{progress.scanned} / {progress.total} targets checked</span>
      <span>{hosts} responsive hosts</span><span>{findings.length} findings</span>
    </div>}
    {error && <div className="p-3 rounded-md border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">{error}</div>}

    {started && <div className="card-surface overflow-hidden">
      <div className="p-4 border-b border-wire-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Observed findings</h2>
          <p className="text-xs text-slate-500">Only checks that returned evidence appear here. An empty list does not establish safety.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} aria-label="Severity filter"
            className="bg-wire-1 border border-wire-2 rounded px-2 py-1 text-xs text-slate-300">
            {['all', 'high', 'medium', 'low', 'info'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <button onClick={() => download(`${baseName}.json`, JSON.stringify({ target, mode, findings }, null, 2), 'application/json')}
            className="flex gap-1 items-center border border-wire-2 rounded px-2 py-1 text-xs text-slate-300"><Download size={12} /> JSON</button>
          <button onClick={() => download(`${baseName}.csv`, [
            'IP,Port,Severity,Title,Evidence,Remediation',
            ...findings.map(item => csvRow([item.ip, item.port, item.severity, item.title, item.evidence, item.remediation])),
          ].join('\n'), 'text/csv')}
            className="flex gap-1 items-center border border-wire-2 rounded px-2 py-1 text-xs text-slate-300"><Download size={12} /> CSV</button>
        </div>
      </div>
      {visible.length === 0 && <p className="p-6 text-sm text-slate-500">No findings for this filter.</p>}
      <div className="divide-y divide-wire-1">{visible.map(item => <article key={item.id} className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[11px] uppercase px-2 py-0.5 border rounded ${badge[item.severity]}`}>{item.severity}</span>
          <h3 className="font-medium text-sm text-slate-200">{item.title}</h3>
          <span className="ml-auto text-xs font-mono text-slate-500">{item.ip}:{item.port}</span>
        </div>
        <p className="text-xs text-slate-400">{item.description}</p>
        <div className="rounded border border-wire-2 bg-surface-0 p-2 text-xs font-mono text-slate-300 break-all">Evidence: {item.evidence}</div>
        <p className="text-xs text-slate-400">Remediation: {item.remediation}</p>
      </article>)}</div>
    </div>}
  </div>
}
