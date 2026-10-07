import type { Tool } from '../../types'

export function ToolPlaceholder({ tool }: { tool: Tool }) {
  const Icon = tool.icon
  return (
    <div className="min-h-full p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Icon size={22} className="text-slate-400" />
        <h1 className="text-xl font-semibold text-slate-100">{tool.name}</h1>
        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">Planned</span>
      </div>
      <div className="card-surface max-w-2xl p-5 space-y-3">
        <p className="text-sm text-slate-300">This tool is not implemented yet. It does not collect data or produce findings.</p>
        <p className="text-sm text-slate-500">Planned purpose: {tool.description}</p>
      </div>
    </div>
  )
}
