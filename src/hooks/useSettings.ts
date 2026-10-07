import { useState, useCallback } from 'react'
import { getSessionSecrets, setSessionSecrets } from '../lib/api'

export type Theme = 'midnight' | 'phosphor' | 'obsidian' | 'graphite'
export type FontSize = 'small' | 'default' | 'large'
export type SidebarDensity = 'compact' | 'comfortable' | 'spacious'
export type SessionTimeout = '15m' | '30m' | '1h' | '4h' | 'never'

export interface AppSettings {
  // General
  orgName: string
  timezone: string
  sessionTimeout: SessionTimeout
  autoUpdate: boolean
  crashReports: boolean
  scanRetention: string
  activityRetention: string
  alertRetention: string

  // Appearance
  theme: Theme
  sidebarDensity: SidebarDensity
  fontSize: FontSize
  monoFont: string
  reducedMotion: boolean

  // Notifications
  webhookEnabled: boolean
  webhookUrl: string
  minSeverity: string
  criticalOnly: boolean
  alertDigest: string

  // Security
  twoFactor: boolean
  ssoProvider: string
  passwordPolicy: string
  ipAllowlist: boolean
  allowedIPs: string
  auditLog: boolean
  apiAccess: boolean

  // API keys (stored as plain text — no real server involved)
  apiKeys: Record<string, string>

  // Key required by the local API server (set CYBERWEB_API_KEY in .env)
  serverApiKey: string
}

const DEFAULTS: AppSettings = {
  orgName: 'My Organization',
  timezone: 'UTC',
  sessionTimeout: 'never',
  autoUpdate: true,
  crashReports: false,
  scanRetention: '90 days',
  activityRetention: '1 year',
  alertRetention: '1 year',

  theme: 'midnight',
  sidebarDensity: 'comfortable',
  fontSize: 'default',
  monoFont: 'JetBrains Mono',
  reducedMotion: false,

  webhookEnabled: false,
  webhookUrl: '',
  minSeverity: 'Medium',
  criticalOnly: false,
  alertDigest: 'Real-time',

  twoFactor: false,
  ssoProvider: 'None',
  passwordPolicy: 'Strong (12+ chars)',
  ipAllowlist: false,
  allowedIPs: '',
  auditLog: true,
  apiAccess: true,

  apiKeys: {
    Shodan: '',
    VirusTotal: '',
    AbuseIPDB: '',
    Censys: '',
    PagerDuty: '',
    GeoSpy: '',
  },

  serverApiKey: '',
}

const STORAGE_KEY = 'cyberweb-settings'

function load(): AppSettings {
  const secrets = getSessionSecrets()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    const { apiKeys: _oldKeys, serverApiKey: _oldServerKey, ...safe } = saved
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe))
    return { ...DEFAULTS, ...safe, apiKeys: { ...DEFAULTS.apiKeys, ...secrets.apiKeys }, serverApiKey: secrets.serverApiKey || '' }
  } catch {
    return { ...DEFAULTS, apiKeys: { ...DEFAULTS.apiKeys, ...secrets.apiKeys }, serverApiKey: secrets.serverApiKey || '' }
  }
}

function persist(s: AppSettings) {
  const { apiKeys, serverApiKey, ...safe } = s
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe))
  setSessionSecrets({ apiKeys, serverApiKey })
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(load)

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      persist(next)
      return next
    })
  }, [])

  const updateMany = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      persist(next)
      return next
    })
  }, [])

  const setApiKey = useCallback((name: string, value: string) => {
    setSettings(prev => {
      const next = { ...prev, apiKeys: { ...prev.apiKeys, [name]: value } }
      persist(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    persist(DEFAULTS)
    setSettings(DEFAULTS)
  }, [])

  return { settings, update, updateMany, setApiKey, reset }
}

// Timeout values in ms for session timeout
export const SESSION_TIMEOUT_MS: Record<SessionTimeout, number | null> = {
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '4h':  4 * 60 * 60 * 1000,
  'never': null,
}
