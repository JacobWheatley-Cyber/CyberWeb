import { useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { CheckCircle2, ChevronRight, Play, RotateCcw, FileDown, Clock } from 'lucide-react'
import type { Tool } from '../../types'

interface ToolPlaceholderProps {
  tool: Tool
}

const recentRuns = [
  { id: 1, target: '192.168.1.0/24', started: '2h ago', duration: '4m 12s', status: 'completed', findings: 3 },
  { id: 2, target: 'web-prod-01', started: '6h ago', duration: '2m 51s', status: 'completed', findings: 0 },
  { id: 3, target: '10.0.0.0/16', started: '1d ago', duration: '18m 03s', status: 'completed', findings: 12 },
]

export function ToolPlaceholder({ tool }: ToolPlaceholderProps) {
  const [mode, setMode] = useState('Standard')
  const [target, setTarget] = useState('')
  const [output, setOutput] = useState<'json' | 'csv' | 'html'>('json')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  const Icon = tool.icon
  const isRed = tool.team === 'red'

  function handleLaunch() {
    if (!target.trim()) return
    setRunning(true)
    setProgress(0)
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval)
          setRunning(false)
          return 100
        }
        return p + Math.random() * 8 + 2
      })
    }, 200)
  }

  return (
    <div className="min-h-full p-6 space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div className="flex items-start gap-4">
          <div
            className={clsx(
              'p-3 rounded-lg border flex-shrink-0',
              isRed
                ? 'bg-rose-500/10 border-rose-500/20'
                : 'bg-blue-500/10 border-blue-500/20',
            )}
          >
            <Icon size={22} className={isRed ? 'text-rose-400' : 'text-blue-400'} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-100 tracking-tight">{tool.name}</h1>
              <span
                className={clsx(
                  'text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border',
                  isRed
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : 'text-blue-400 bg-blue-500/10 border-blue-500/20',
                )}
              >
                {isRed ? 'Red Team' : 'Blue Team'} · {tool.category}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">{tool.description}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Config panel */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="lg:col-span-2 space-y-4"
        >
          <div className="card-surface p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Configuration</h2>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Target</label>
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="IP, hostname, CIDR range, or URL…"
                className={clsx(
                  'w-full bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] text-slate-300',
                  'placeholder:text-slate-600 font-mono outline-none transition-all duration-150',
                  'focus:border-blue-500/40 focus:bg-surface-3',
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Scan Mode</label>
                <div className="flex gap-1.5">
                  {['Quick', 'Standard', 'Thorough'].map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={clsx(
                        'flex-1 py-1.5 rounded-md text-[12px] font-medium border transition-all duration-150',
                        mode === m
                          ? isRed
                            ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                          : 'bg-wire-1 text-slate-500 border-wire-2 hover:text-slate-300',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Output Format</label>
                <div className="flex gap-1.5">
                  {(['json', 'csv', 'html'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setOutput(fmt)}
                      className={clsx(
                        'flex-1 py-1.5 rounded-md text-[12px] font-medium border uppercase transition-all duration-150',
                        output === fmt
                          ? 'bg-slate-600/30 text-slate-200 border-slate-600/50'
                          : 'bg-wire-1 text-slate-500 border-wire-2 hover:text-slate-300',
                      )}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Notes / Scope</label>
              <textarea
                rows={2}
                placeholder="Add scope notes, exclusions, or context for this scan…"
                className={clsx(
                  'w-full bg-wire-1 border border-wire-3 rounded-md px-3 py-2 text-[13px] text-slate-300',
                  'placeholder:text-slate-600 outline-none resize-none transition-all duration-150',
                  'focus:border-blue-500/40 focus:bg-surface-3',
                )}
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <motion.button
                onClick={handleLaunch}
                disabled={running || !target.trim()}
                whileTap={{ scale: 0.97 }}
                className={clsx(
                  'flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-all duration-200',
                  running || !target.trim()
                    ? 'opacity-50 cursor-not-allowed bg-wire-2 text-slate-500'
                    : isRed
                      ? 'bg-rose-500 hover:bg-rose-400 text-white'
                      : 'bg-blue-500 hover:bg-blue-400 text-white',
                )}
              >
                <Play size={14} />
                {running ? 'Running…' : 'Launch'}
              </motion.button>

              <button className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 border border-wire-2 hover:border-wire-3 transition-all duration-150">
                <RotateCcw size={13} />
                Reset
              </button>
            </div>

            {/* Progress bar */}
            {(running || progress > 0) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-500">{running ? 'Scanning…' : 'Complete'}</span>
                  <span className="font-mono text-slate-400">{Math.min(Math.round(progress), 100)}%</span>
                </div>
                <div className="h-1.5 bg-wire-2 rounded-full overflow-hidden">
                  <motion.div
                    className={clsx('h-full rounded-full', isRed ? 'bg-rose-400' : 'bg-blue-400')}
                    animate={{ width: `${Math.min(progress, 100)}%` }}
                    transition={{ ease: 'easeOut' }}
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* Recent runs */}
          <div className="card-surface overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-wire-1">
              <h2 className="text-sm font-semibold text-slate-200">Recent Runs</h2>
              <button className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-300 transition-colors">
                <FileDown size={12} /> Export
              </button>
            </div>
            <div className="divide-y divide-wire-1">
              {recentRuns.map(run => (
                <div key={run.id} className="flex items-center gap-4 px-5 py-3 hover:bg-wire-1 transition-colors cursor-pointer">
                  <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-mono text-slate-300">{run.target}</div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[11px] text-slate-600 flex items-center gap-1">
                        <Clock size={10} /> {run.started}
                      </span>
                      <span className="text-[11px] text-slate-600">{run.duration}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {run.findings > 0 ? (
                      <span className="text-[12px] font-medium text-amber-400">{run.findings} findings</span>
                    ) : (
                      <span className="text-[12px] text-slate-600">Clean</span>
                    )}
                  </div>
                  <ChevronRight size={13} className="text-slate-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Capabilities panel */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="space-y-4"
        >
          <div className="card-surface p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Capabilities</h2>
            <ul className="space-y-2.5">
              {tool.capabilities.map((cap, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  className="flex items-start gap-2.5"
                >
                  <div
                    className={clsx(
                      'mt-0.5 h-4 w-4 rounded flex items-center justify-center flex-shrink-0',
                      isRed ? 'bg-rose-500/15' : 'bg-blue-500/15',
                    )}
                  >
                    <div className={clsx('h-1.5 w-1.5 rounded-full', isRed ? 'bg-rose-400' : 'bg-blue-400')} />
                  </div>
                  <span className="text-[13px] text-slate-400 leading-snug">{cap}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="card-surface p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Tool Status</h2>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Status</span>
                <span className="text-[12px] font-medium text-slate-300 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Ready
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Signatures</span>
                <span className="text-[12px] font-mono text-slate-400">Up to date</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Last run</span>
                <span className="text-[12px] text-slate-400">2h ago</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Total scans</span>
                <span className="text-[12px] font-mono text-slate-400">247</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
