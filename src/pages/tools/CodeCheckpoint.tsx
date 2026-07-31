import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  FileText,
  GitBranch,
  GitCommit,
  Github,
  GitMerge,
  Link,
  MessageSquarePlus,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  UploadCloud,
  XCircle,
  Zap,
} from 'lucide-react'

import { apiFetch } from '../../lib/api'

const API = 'http://localhost:3001'

interface GitChange {
  code: string
  path: string
}

interface GitRemote {
  name: string
  url: string
  kind: string
}

interface GitStatus {
  repo: boolean
  root: string
  branch: string
  upstream: string
  ahead: number
  behind: number
  changes: GitChange[]
  remotes: GitRemote[]
  lastCommit: { hash: string; subject: string; when: string; author: string } | null
}

interface RunResult {
  ok?: boolean
  error?: string
  steps?: string[]
  commit?: { hash: string; subject: string } | null
  pushed?: boolean
  pushRejected?: boolean
  status?: GitStatus
}

interface GitCommitEntry {
  hash: string
  subject: string
  when: string
  author: string
  files: number
  insertions: number
  deletions: number
}

type NoteSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

const statusColor: Record<string, string> = {
  M: 'text-amber-300 border-amber-500/25 bg-amber-500/10',
  A: 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10',
  D: 'text-rose-300 border-rose-500/25 bg-rose-500/10',
  R: 'text-blue-300 border-blue-500/25 bg-blue-500/10',
  '??': 'text-slate-300 border-slate-500/25 bg-slate-500/10',
}

function defaultMessage() {
  return `Checkpoint ${new Date().toLocaleString()}`
}

function githubRepoUrl(remoteUrl = '') {
  if (!remoteUrl) return ''
  const https = remoteUrl.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/)
  if (https) return `https://github.com/${https[1].replace(/\.git$/, '')}`
  const ssh = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/)
  if (ssh) return `https://github.com/${ssh[1].replace(/\.git$/, '')}`
  return ''
}

function StatCard({ label, value, icon: Icon, tone = 'blue' }: { label: string; value: string | number; icon: typeof Circle; tone?: 'blue' | 'green' | 'amber' }) {
  const tones = {
    blue: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
    green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  }
  return (
    <div className="card-surface p-4 flex items-center gap-3">
      <div className={clsx('p-2 rounded-md border', tones[tone])}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold text-slate-100 leading-none">{value}</div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
      </div>
    </div>
  )
}

export function CodeCheckpoint() {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState(defaultMessage)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [push, setPush] = useState(true)
  const [protectGenerated, setProtectGenerated] = useState(true)
  const [result, setResult] = useState<RunResult | null>(null)
  const [forceConfirm, setForceConfirm] = useState(false)
  const [commitLog, setCommitLog] = useState<GitCommitEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteSeverity, setNoteSeverity] = useState<NoteSeverity>('info')
  const [notePosting, setNotePosting] = useState(false)
  const [notePosted, setNotePosted] = useState(false)

  const origin = useMemo(() => status?.remotes.find(r => r.name === 'origin' && r.kind === 'fetch'), [status])
  const repoUrl = githubRepoUrl(remoteUrl || origin?.url || '')
  const dirtyCount = status?.changes.length || 0

  async function loadStatus() {
    setLoading(true)
    try {
      const resp = await apiFetch(`${API}/api/checkpoint/status`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Unable to load status')
      setStatus(data)
      if (data.branch) setBranch(data.branch)
      if (!remoteUrl && data.remotes?.length) {
        const originFetch = data.remotes.find((r: GitRemote) => r.name === 'origin' && r.kind === 'fetch')
        if (originFetch) setRemoteUrl(originFetch.url)
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }

  async function loadLog() {
    setLogLoading(true)
    try {
      const resp = await apiFetch(`${API}/api/checkpoint/log`)
      if (resp.ok) setCommitLog(await resp.json())
    } catch { /* non-fatal */ }
    finally { setLogLoading(false) }
  }

  async function postNote() {
    if (!noteText.trim()) return
    setNotePosting(true)
    try {
      await apiFetch(`${API}/api/checkpoint/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: noteText.trim(), severity: noteSeverity }),
      })
      setNoteText('')
      setNotePosted(true)
      setTimeout(() => setNotePosted(false), 2500)
    } catch { /* ignore */ }
    finally { setNotePosting(false) }
  }

  useEffect(() => {
    loadStatus()
    loadLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function post(path: string, body: Record<string, unknown>) {
    setRunning(true)
    setResult(null)
    try {
      const resp = await apiFetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data })
      setResult(data)
      if (data.status) setStatus(data.status)
      if (data.commit) loadLog()
    } catch (err) {
      const data = (err as Error & { data?: RunResult }).data
      setResult(data || { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setRunning(false)
    }
  }

  function initRepo() {
    post('/api/checkpoint/init', { remoteUrl, branch, protectGenerated })
  }

  function runCheckpoint() {
    setForceConfirm(false)
    post('/api/checkpoint/run', {
      message,
      push,
      remote: 'origin',
      branch,
      initIfNeeded: true,
      remoteUrl,
      protectGenerated,
    })
  }

  function runWithStrategy(pushStrategy: 'rebase' | 'force') {
    setForceConfirm(false)
    post('/api/checkpoint/run', {
      message,
      push: true,
      remote: 'origin',
      branch,
      initIfNeeded: false,
      remoteUrl,
      protectGenerated,
      pushStrategy,
    })
  }

  return (
    <div className="min-h-full p-6 space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div className="flex items-start gap-4 min-w-0">
          <div className="p-3 rounded-lg border bg-blue-500/10 border-blue-500/20 flex-shrink-0">
            <Github size={23} className="text-blue-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Code Checkpoint</h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border text-blue-300 bg-blue-500/10 border-blue-500/20">
                GitHub Submit
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Stage the workspace, create a checkpoint commit, and push it to the configured GitHub remote using your local Git credentials.
            </p>
          </div>
        </div>

        <button
          onClick={loadStatus}
          disabled={loading || running}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-wire-2 text-slate-400 hover:text-slate-200 hover:border-wire-3 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Repository" value={status?.repo ? 'Ready' : 'Not initialized'} icon={status?.repo ? CheckCircle2 : AlertTriangle} tone={status?.repo ? 'green' : 'amber'} />
        <StatCard label="Branch" value={status?.branch || branch || 'main'} icon={GitBranch} />
        <StatCard label="Pending files" value={dirtyCount} icon={FileText} tone={dirtyCount ? 'amber' : 'green'} />
        <StatCard label="Ahead / behind" value={`${status?.ahead || 0} / ${status?.behind || 0}`} icon={UploadCloud} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="xl:col-span-2 space-y-5"
        >
          <div className="card-surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Checkpoint Setup</h2>
              {repoUrl && (
                <a href={repoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12px] text-blue-300 hover:text-blue-200">
                  <Link size={12} /> Open repo
                </a>
              )}
            </div>

            {!status?.repo && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/8 p-3 flex gap-3">
                <AlertTriangle size={16} className="text-amber-300 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-amber-200">This folder has not been initialized with Git.</div>
                  <div className="text-[12px] text-amber-100/60 mt-0.5">
                    Initialize it here, paste a GitHub remote if you have one, then run the checkpoint.
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">GitHub Remote</label>
                <input
                  value={remoteUrl}
                  onChange={e => setRemoteUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] text-slate-300 placeholder:text-slate-600 font-mono outline-none focus:border-blue-500/40 focus:bg-surface-3"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Branch</label>
                <input
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] text-slate-300 placeholder:text-slate-600 font-mono outline-none focus:border-blue-500/40 focus:bg-surface-3"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Commit Message</label>
              <input
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] text-slate-300 placeholder:text-slate-600 outline-none focus:border-blue-500/40 focus:bg-surface-3"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-wire-2 bg-wire-1 text-[12px] text-slate-300">
                <input type="checkbox" checked={push} onChange={e => setPush(e.target.checked)} className="accent-blue-500" />
                Push after commit
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-wire-2 bg-wire-1 text-[12px] text-slate-300">
                <input type="checkbox" checked={protectGenerated} onChange={e => setProtectGenerated(e.target.checked)} className="accent-blue-500" />
                Protect generated files
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={runCheckpoint}
                disabled={running}
                className="flex items-center gap-2 px-5 py-2 rounded-md bg-blue-500 hover:bg-blue-400 disabled:bg-wire-2 disabled:text-slate-500 text-white text-sm font-medium transition-colors"
              >
                <Play size={14} />
                {running ? 'Working...' : push ? 'Checkpoint & Push' : 'Create Checkpoint'}
              </button>
              <button
                onClick={initRepo}
                disabled={running}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 border border-wire-2 hover:border-wire-3 disabled:opacity-50"
              >
                <GitBranch size={14} />
                Initialize / Connect
              </button>
            </div>
          </div>

          <div className="card-surface overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-wire-1">
              <h2 className="text-sm font-semibold text-slate-200">Working Tree</h2>
              <span className="text-[12px] text-slate-500">{dirtyCount} pending</span>
            </div>
            <div className="max-h-[360px] overflow-y-auto divide-y divide-wire-1">
              {loading ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500">Loading repository state...</div>
              ) : dirtyCount === 0 ? (
                <div className="px-5 py-8 text-center">
                  <CheckCircle2 size={22} className="text-emerald-300 mx-auto mb-2" />
                  <div className="text-sm text-slate-300">Working tree is clean</div>
                  <div className="text-[12px] text-slate-600 mt-1">No files are waiting to be checkpointed.</div>
                </div>
              ) : (
                status?.changes.map(change => (
                  <div key={`${change.code}-${change.path}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-wire-1">
                    <span className={clsx('w-9 text-center rounded border py-0.5 text-[11px] font-mono font-semibold', statusColor[change.code] || statusColor[change.code[0]] || statusColor['??'])}>
                      {change.code}
                    </span>
                    <span className="font-mono text-[12px] text-slate-300 truncate">{change.path}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-5"
        >
          <div className="card-surface p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Repository</h2>
            <div className="space-y-3 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Root</span>
                <span className="font-mono text-slate-300 truncate text-right" title={status?.root}>{status?.root || 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Upstream</span>
                <span className="font-mono text-slate-300 truncate text-right">{status?.upstream || 'Not set'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Remote</span>
                <span className="font-mono text-slate-300 truncate text-right">{origin?.url || remoteUrl || 'Not set'}</span>
              </div>
            </div>
            {(origin?.url || remoteUrl) && (
              <button
                onClick={() => navigator.clipboard.writeText(origin?.url || remoteUrl)}
                className="flex items-center gap-2 text-[12px] text-slate-400 hover:text-slate-200"
              >
                <Copy size={12} /> Copy remote URL
              </button>
            )}
          </div>

          <div className="card-surface p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Last Commit</h2>
            {status?.lastCommit ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <GitCommit size={15} className="text-blue-300" />
                  <span className="font-mono text-sm text-blue-200">{status.lastCommit.hash}</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{status.lastCommit.subject}</p>
                <div className="flex items-center gap-2 text-[12px] text-slate-500">
                  <Clock size={12} />
                  {status.lastCommit.when} by {status.lastCommit.author}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No commits have been created yet.</div>
            )}
          </div>

          <div className="card-surface p-5 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquarePlus size={14} className="text-blue-300" />
              <h2 className="text-sm font-semibold text-slate-200">Post to Activity Feed</h2>
            </div>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Write a note that will appear in the dashboard's Recent Activity section.
            </p>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="e.g. Refactored auth module, added rate limiting…"
              rows={3}
              className="w-full bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] text-slate-300 placeholder:text-slate-600 outline-none focus:border-blue-500/40 focus:bg-surface-3 resize-none"
            />
            <div className="flex items-center gap-2">
              <select
                value={noteSeverity}
                onChange={e => setNoteSeverity(e.target.value as NoteSeverity)}
                className="bg-wire-1 border border-wire-3 rounded-md px-2 py-1.5 text-[12px] text-slate-300 outline-none focus:border-blue-500/40 cursor-pointer"
              >
                <option value="info">Info</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <button
                onClick={postNote}
                disabled={notePosting || !noteText.trim()}
                className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 disabled:bg-wire-2 disabled:text-slate-500 text-white text-[12px] font-medium transition-colors"
              >
                {notePosted
                  ? <><CheckCircle2 size={13} className="text-emerald-300" /> Posted!</>
                  : <><Activity size={13} /> {notePosting ? 'Posting…' : 'Post Note'}</>}
              </button>
            </div>
          </div>

          <div className="card-surface overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-wire-1">
              <Terminal size={14} className="text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-200">Run Log</h2>
            </div>
            <div className="p-4 space-y-2 min-h-[180px]">
              {result?.steps?.map((step, idx) => (
                <div key={`${step}-${idx}`} className="flex items-start gap-2 text-[12px]">
                  <ShieldCheck size={13} className="text-emerald-300 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">{step}</span>
                </div>
              ))}

              {result?.error && !result.pushRejected && (
                <div className="rounded-md border border-rose-500/25 bg-rose-500/10 p-3 flex gap-2 text-[12px] text-rose-200">
                  <XCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span className="font-mono break-all">{result.error}</span>
                </div>
              )}

              {result?.pushRejected && (
                <div className="rounded-md border border-amber-500/25 bg-amber-500/8 p-3 space-y-3">
                  <div className="flex gap-2 text-[12px] text-amber-200">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-300" />
                    <div>
                      <div className="font-medium">Push rejected — remote has commits you don't have locally.</div>
                      <div className="text-amber-100/60 mt-0.5">Choose how to recover:</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => runWithStrategy('rebase')}
                      disabled={running}
                      className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-[12px] font-medium transition-colors"
                    >
                      <GitMerge size={13} />
                      Pull &amp; Rebase, then Push
                      <span className="ml-auto text-blue-200 font-normal">Recommended</span>
                    </button>
                    {!forceConfirm ? (
                      <button
                        onClick={() => setForceConfirm(true)}
                        disabled={running}
                        className="flex items-center gap-2 px-3 py-2 rounded-md border border-rose-500/30 bg-rose-500/8 text-rose-300 hover:bg-rose-500/15 disabled:opacity-50 text-[12px] font-medium transition-colors"
                      >
                        <Zap size={13} />
                        Force Push
                      </button>
                    ) : (
                      <div className="rounded-md border border-rose-500/30 bg-rose-500/8 p-2.5 space-y-2">
                        <div className="text-[11px] text-rose-300">This overwrites the remote branch. Remote commits not in your local history will be lost.</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => runWithStrategy('force')}
                            disabled={running}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[12px] font-medium disabled:opacity-50"
                          >
                            <Zap size={12} /> Confirm Force Push
                          </button>
                          <button
                            onClick={() => setForceConfirm(false)}
                            className="px-3 py-1.5 rounded border border-wire-2 text-slate-400 hover:text-slate-200 text-[12px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!result && (
                <div className="text-[12px] text-slate-600">
                  Status and checkpoint results will appear here after an action runs.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Commit history ──────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="card-surface overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-wire-1">
            <div className="flex items-center gap-2">
              <GitCommit size={14} className="text-blue-300" />
              <h2 className="text-sm font-semibold text-slate-200">Commit History</h2>
            </div>
            <div className="flex items-center gap-3">
              {commitLog.length > 0 && (
                <span className="text-[12px] text-slate-500 font-mono">{commitLog.length} commits</span>
              )}
              <button
                onClick={loadLog}
                disabled={logLoading}
                className="text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw size={13} className={logLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {logLoading && commitLog.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">Loading commit history…</div>
          ) : commitLog.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <GitCommit size={22} className="text-slate-700 mx-auto mb-2" />
              <div className="text-sm text-slate-500">No commits yet</div>
              <div className="text-[12px] text-slate-600 mt-1">Create your first checkpoint to see history here.</div>
            </div>
          ) : (
            <div className="px-5 py-4 max-h-[420px] overflow-y-auto">
              <div className="relative ml-1">
                {/* Vertical track line */}
                <div className="absolute left-0 top-2 bottom-2 w-px bg-wire-2" />

                {commitLog.map((c) => {
                  const dotColor =
                    c.insertions > 0 && c.deletions > 0 ? 'bg-amber-400 border-amber-400'
                    : c.insertions > 0                  ? 'bg-emerald-400 border-emerald-400'
                    : c.deletions > 0                   ? 'bg-rose-400 border-rose-400'
                    :                                     'bg-slate-500 border-slate-500'

                  return (
                    <div key={c.hash} className="relative pl-6 pb-5 last:pb-0">
                      {/* Dot on track */}
                      <div className={clsx(
                        'absolute left-[-4px] top-[5px] w-[9px] h-[9px] rounded-full border-2 border-surface-0',
                        dotColor,
                      )} />

                      {/* Commit content */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 flex-shrink-0">
                            {c.hash}
                          </span>
                          <span className="text-[13px] text-slate-200 leading-snug">{c.subject}</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-[11px] flex-wrap">
                          <span className="text-slate-500">{c.author}</span>
                          <span className="text-slate-700">·</span>
                          <span className="text-slate-600">{c.when}</span>
                          {c.files > 0 && (
                            <>
                              <span className="text-slate-700">·</span>
                              <span className="text-slate-500">{c.files} file{c.files !== 1 ? 's' : ''}</span>
                              {c.insertions > 0 && (
                                <span className="text-emerald-500 font-mono">+{c.insertions}</span>
                              )}
                              {c.deletions > 0 && (
                                <span className="text-rose-500 font-mono">-{c.deletions}</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
