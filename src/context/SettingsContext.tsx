import { createContext, useContext } from 'react'
import type { AppSettings } from '../hooks/useSettings'

interface SettingsCtx {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateMany: (patch: Partial<AppSettings>) => void
  setApiKey: (name: string, value: string) => void
  reset: () => void
}

export const SettingsContext = createContext<SettingsCtx | null>(null)

export function useSettingsContext() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettingsContext must be used inside SettingsProvider')
  return ctx
}
