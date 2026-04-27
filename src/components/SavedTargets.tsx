import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bookmark, BookmarkPlus, ChevronDown, X, Check } from 'lucide-react'
import clsx from 'clsx'
import { useSavedTargets } from '../hooks/useSavedTargets'

interface SavedTargetsProps {
  currentValue: string
  onSelect: (value: string) => void
  accentColor?: 'red' | 'blue'
}

export function SavedTargets({ currentValue, onSelect, accentColor = 'blue' }: SavedTargetsProps) {
  const { targets, save, remove } = useSavedTargets()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const isRed = accentColor === 'red'

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSave() {
    if (!saveName.trim() || !currentValue.trim()) return
    save(saveName.trim(), currentValue.trim())
    setSaveName('')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-2 rounded-md border text-[12px] font-medium transition-all duration-150',
          open
            ? isRed
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
              : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
            : 'bg-wire-1 border-wire-2 text-slate-400 hover:text-slate-200 hover:border-wire-3',
        )}
      >
        {saved ? <Check size={13} className="text-emerald-400" /> : <Bookmark size={13} />}
        Targets
        <span className={clsx(
          'text-[10px] px-1 rounded font-mono',
          targets.length > 0 ? (isRed ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400') : 'text-slate-600',
        )}>
          {targets.length}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={11} />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 w-72 card-surface-elevated z-50 overflow-hidden shadow-xl"
          >
            {/* Save current */}
            <div className="p-3 border-b border-wire-1">
              {saving ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setSaving(false) }}
                    placeholder="Label for this target…"
                    className="flex-1 bg-wire-1 border border-wire-3 rounded-md px-2.5 py-1.5 text-[12px] text-slate-300 placeholder:text-slate-600 outline-none focus:border-blue-500/40 transition-all"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!saveName.trim()}
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-[12px] font-medium transition-all',
                      saveName.trim()
                        ? isRed ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'
                        : 'bg-wire-2 text-slate-600 cursor-not-allowed',
                    )}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setSaving(true); setSaveName('') }}
                  disabled={!currentValue.trim()}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-all',
                    currentValue.trim()
                      ? isRed
                        ? 'text-rose-400 border-rose-500/20 hover:bg-rose-500/10'
                        : 'text-blue-400 border-blue-500/20 hover:bg-blue-500/10'
                      : 'text-slate-600 border-wire-2 cursor-not-allowed',
                  )}
                >
                  <BookmarkPlus size={13} />
                  Save "{currentValue.slice(0, 28)}{currentValue.length > 28 ? '…' : ''}"
                </button>
              )}
            </div>

            {/* Saved list */}
            <div className="max-h-52 overflow-y-auto">
              {targets.length === 0 ? (
                <p className="px-4 py-5 text-center text-[12px] text-slate-600">
                  No saved targets yet.
                </p>
              ) : (
                targets.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-wire-2 transition-colors border-b border-wire-1 last:border-0 group"
                  >
                    <button
                      onClick={() => { onSelect(t.value); setOpen(false) }}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="text-[12px] font-medium text-slate-300 truncate">{t.name}</div>
                      <div className="text-[11px] font-mono text-slate-600 truncate mt-0.5">{t.value}</div>
                    </button>
                    <button
                      onClick={() => remove(t.id)}
                      className="flex-shrink-0 p-1 rounded text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
