import { useEffect, useMemo, useState } from 'react'
import { Code2, Download, Loader2, RefreshCw } from 'lucide-react'
import { apiFetch, ApiRequestError, describeApiError } from '../../lib/api'
import { buildPayloadRequest, PAYLOAD_TEMPLATES } from '../../lib/payloadBuilder.js'
import { payloadSetup } from '../../data/toolManuals'

interface Artifact {
  id: string; filename: string; module: string; platform: string; arch: string; format: string
  host: string; port: number; size: number; sha256: string; createdAt: string; expiresAt: string; handler: string; preview: string
}
interface EngineStatus { available: boolean; mode: string; message?: string }

async function request(url: string, init?: RequestInit) {
  const response = await apiFetch(url, init)
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(response.status === 401 ? describeApiError(new ApiRequestError(401, 'Unauthorized')) : data?.error || `API request failed (${response.status}).`)
  }
  return response
}
function save(filename: string, content: Blob) {
  const url = URL.createObjectURL(content)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PayloadBuilder() {
  const [template, setTemplate] = useState('windows-x64')
  const [format, setFormat] = useState('exe')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('4444')
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [building, setBuilding] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const selected = PAYLOAD_TEMPLATES.find(item => item.id === template)!
  const validated = useMemo(() => {
    try { return { result: buildPayloadRequest({ template, format, host, port }), error: '' } }
    catch (err) { return { result: null, error: err instanceof Error ? err.message : 'Invalid settings.' } }
  }, [template, format, host, port])
  async function checkEngine() {
    setChecking(true); setError('')
    try { setEngine(await (await request('/api/payloads/status')).json()) }
    catch (err) { setEngine(null); setError(err instanceof Error ? err.message : describeApiError(err)) }
    finally { setChecking(false) }
  }
  useEffect(() => { void checkEngine() }, [])
  async function generate() {
    setBuilding(true); setError(''); setArtifact(null)
    try {
      const response = await request('/api/payloads/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template, format, host, port }) })
      setArtifact(await response.json())
    } catch (err) { setError(err instanceof Error ? err.message : describeApiError(err)) }
    finally { setBuilding(false) }
  }
  async function downloadArtifact() {
    if (!artifact) return
    setDownloading(true); setError('')
    try { save(artifact.filename, await (await request(`/api/payloads/artifacts/${artifact.id}`)).blob()) }
    catch (err) { setError(err instanceof Error ? err.message : describeApiError(err)) }
    finally { setDownloading(false) }
  }
  const inputClass = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white'
  const blockedReason = building ? 'A payload build is running.' : checking ? 'Waiting for the Metasploit compiler check to finish.' : !engine ? 'Connect to the API with your Server API Key, then select Recheck compiler.' : !engine.available ? 'Metasploit is unavailable on the API host. Follow the compiler setup instructions below, restart CyberWeb, then recheck.' : validated.error
  return <div className="space-y-6 p-4 md:p-6 text-gray-200">
    <header><div className="flex items-center gap-3"><Code2 className="text-red-400" /><h1 className="text-2xl font-semibold text-white">Payload Builder</h1></div>
      <p className="mt-2 text-sm text-gray-400">Generate reverse TCP shell payloads with Metasploit for authorized penetration tests.</p></header>
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-medium">Metasploit compiler</h2><p role="status" className="text-sm text-gray-400">{checking ? 'Checking msfvenom…' : engine?.available ? `Ready · ${engine.mode}` : engine?.message || 'Compiler status unavailable.'}</p></div>
      <button onClick={() => void checkEngine()} disabled={checking || building} className="flex items-center gap-2 text-sm disabled:opacity-50"><RefreshCw size={16} /> Recheck compiler</button>
    </section>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="font-semibold text-white">Payload settings</h2>
        <label className="block text-sm">Platform and architecture<select aria-label="Platform and architecture" className={`${inputClass} mt-2`} value={template} disabled={building} onChange={event => { const item = PAYLOAD_TEMPLATES.find(entry => entry.id === event.target.value)!; setTemplate(item.id); setFormat(item.formats[0]) }}>{PAYLOAD_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <p className="break-all font-mono text-xs text-gray-400">{selected.module} · stageless</p>
        <label className="block text-sm">Output format<select aria-label="Output format" className={`${inputClass} mt-2`} value={format} disabled={building} onChange={event => setFormat(event.target.value)}>{selected.formats.map(item => <option key={item} value={item}>{item === 'raw' ? 'Raw shellcode (.bin)' : item === 'exe' ? 'Windows executable (.exe)' : 'Linux executable (.elf)'}</option>)}</select></label>
        <label className="block text-sm">Callback host (LHOST)<input aria-label="Callback host" className={`${inputClass} mt-2`} placeholder="192.168.1.10" value={host} disabled={building} onChange={event => setHost(event.target.value)} /></label>
        <p className="text-xs text-gray-400">Address the test target can reach on your listener machine. This is the callback destination.</p>
        <label className="block text-sm">Callback port (LPORT)<input aria-label="Callback port" className={`${inputClass} mt-2`} inputMode="numeric" value={port} disabled={building} onChange={event => setPort(event.target.value)} /></label>
        {host && validated.error && <p className="text-sm text-amber-300">{validated.error}</p>}
        <button onClick={() => void generate()} aria-describedby="payload-build-requirement" disabled={!!blockedReason} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{building && <Loader2 size={16} className="animate-spin" />}{building ? 'Building payload…' : 'Generate payload'}</button>
        <p id="payload-build-requirement" aria-live="polite" className={`text-sm ${blockedReason ? 'text-amber-300' : 'text-green-400'}`}>{blockedReason || 'Ready to generate.'}</p>
        {engine && !engine.available && <details className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-amber-200">Set up Metasploit on Windows</summary>
          <div className="mt-3 space-y-3 text-gray-300">{payloadSetup.paragraphs.map(text => <p key={text}>{text}</p>)}<pre className="whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 text-xs">{payloadSetup.code}</pre>
            <p>Then add these values to CyberWeb’s .env, restart CyberWeb.bat, and recheck the compiler. Use your actual WSL distribution name and compiler path.</p>
            <pre className="whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 text-xs">{'CYBERWEB_MSF_MODE=wsl\nCYBERWEB_MSF_DISTRO=kali-linux\nCYBERWEB_MSF_PATH=/usr/bin/msfvenom'}</pre>
            <p>For native Linux, set CYBERWEB_MSF_MODE=native and the installed compiler path. The Tool manual has the full workflow and troubleshooting.</p>
            {payloadSetup.links?.map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="block text-blue-400 underline">{link.label}</a>)}
          </div>
        </details>}
        <p className="text-xs text-gray-400">Builds can take up to two minutes. Files are available for one hour, until the API restarts, or until eight newer builds replace them.</p>
      </section>
      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5 min-w-0">
        <h2 className="font-semibold text-white">Build preview</h2>
        <pre className="whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 text-xs text-gray-300">{validated.result ? ['msfvenom', ...validated.result.args].join(' ') : 'Enter a callback host and valid port to preview the build.'}</pre>
        <p className="text-sm text-gray-400">EXE and ELF outputs are executable wrappers. Raw output is shellcode and requires a compatible loader. Generation does not deliver or execute the file.</p>
        {artifact && <div className="space-y-4" data-testid="artifact">
          <h3 className="text-green-400 font-medium">Payload generated</h3>
          <p className="text-sm break-all">{artifact.filename}<br /><span className="text-gray-400">{artifact.platform} {artifact.arch} · {artifact.size.toLocaleString()} bytes · {artifact.host}:{artifact.port}</span></p>
          <div><p className="text-xs text-gray-400">SHA-256</p><p className="font-mono text-xs break-all">{artifact.sha256}</p></div>
          <div><p className="text-xs text-gray-400">First 64 bytes (hex)</p><pre className="whitespace-pre-wrap break-all font-mono text-xs">{artifact.preview}</pre></div>
          <button onClick={() => void downloadArtifact()} disabled={downloading} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm disabled:opacity-40"><Download size={16} /> Download payload</button>
          <h3 className="font-medium">Matching Metasploit handler</h3>
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 text-xs">{artifact.handler}</pre>
          <button onClick={() => save(artifact.filename.replace(/\.[^.]+$/, '.rc'), new Blob([artifact.handler], { type: 'text/plain' }))} className="flex items-center gap-2 text-sm"><Download size={16} /> Download handler configuration</button>
          <p className="text-xs text-gray-400">Run the resource file with msfconsole -r filename.rc on the listener machine. When the callback uses NAT or a DNS name, adjust the handler bind address to a local interface as needed.</p>
        </div>}
      </section>
    </div>
  </div>
}
