import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Tool } from '../types'
import { getToolManual } from '../data/toolManuals'
import { useSettingsContext } from '../context/SettingsContext'

export function ToolManual({ tool }: { tool: Tool }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [page, setPage] = useState(0)
  const [direction, setDirection] = useState(1)
  const systemReducedMotion = useReducedMotion()
  const { settings } = useSettingsContext()
  const reduced = settings.reducedMotion || systemReducedMotion
  const pages = getToolManual(tool)
  const current = pages[page]
  function turn(next: number) {
    if (next < 0 || next >= pages.length) return
    setDirection(next > page ? 1 : -1); setPage(next)
  }
  return <div className="flex justify-end px-4 pt-4 md:px-6">
    <button onClick={() => { setPage(0); dialog.current?.showModal() }} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"><BookOpen size={16} /> Tool manual</button>
    <dialog ref={dialog} aria-labelledby="tool-manual-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }} onKeyDown={event => {
      if ((event.target as HTMLElement).closest('select')) return
      if (event.key === 'ArrowRight') { event.preventDefault(); turn(page + 1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); turn(page - 1) }
    }} className="m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-0 text-slate-200 shadow-2xl backdrop:bg-black/70">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 p-5"><div><p className="text-xs uppercase tracking-widest text-blue-400">Field manual</p><h2 id="tool-manual-title" className="text-lg font-semibold">{tool.name}</h2></div><button autoFocus aria-label="Close manual" onClick={() => dialog.current?.close()} className="p-2"><X size={20} /></button></header>
      <div className="px-5 pt-4"><label className="text-xs text-slate-400">Contents<select aria-label="Manual contents" value={page} onChange={event => turn(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-200">{pages.map((entry, index) => <option key={entry.title} value={index}>{index + 1}. {entry.title}</option>)}</select></label></div>
      <div style={{ perspective: 1200 }} className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false}><motion.article key={page} initial={reduced ? false : { opacity: 0, rotateY: direction * 12, x: direction * 20 }} animate={{ opacity: 1, rotateY: 0, x: 0 }} exit={reduced ? undefined : { opacity: 0, rotateY: -direction * 12, x: -direction * 20 }} transition={{ duration: reduced ? 0 : 0.18 }} className="min-h-[260px] space-y-4 p-5" aria-label={`Manual page ${page + 1}`}>
          <h3 className="text-xl font-semibold text-white">{current.title}</h3>
          {current.paragraphs.map(text => <p key={text} className="text-sm leading-relaxed text-slate-300">{text}</p>)}
          {current.steps && <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-300">{current.steps.map(text => <li key={text}>{text}</li>)}</ol>}
          {current.code && <pre className="whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-black/40 p-3 text-xs leading-relaxed">{current.code}</pre>}
          {current.links?.map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-400 underline">{link.label}</a>)}
        </motion.article></AnimatePresence>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-slate-800 p-4"><button aria-label="Previous manual page" disabled={page === 0} onClick={() => turn(page - 1)} className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm disabled:opacity-30"><ChevronLeft size={16} /> Previous</button><span aria-live="polite" className="text-xs text-slate-400">Page {page + 1} of {pages.length}</span><button aria-label="Next manual page" disabled={page === pages.length - 1} onClick={() => turn(page + 1)} className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm disabled:opacity-30">Next <ChevronRight size={16} /></button></footer>
    </dialog>
  </div>
}
