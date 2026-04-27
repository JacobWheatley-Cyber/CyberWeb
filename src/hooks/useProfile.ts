import { useState, useCallback } from 'react'

export type UserStatus = 'online' | 'away' | 'dnd' | 'offline'

export interface UserProfile {
  displayName: string
  handle: string
  email: string
  phone: string
  title: string
  bio: string
  avatarColor: string
  avatarUrl: string   // base64 data URL, empty = use initials
  status: UserStatus
  location: string
  timezone: string
  joinedAt: string   // ISO date stored on first use
}

const DEFAULTS: UserProfile = {
  displayName: 'Operator',
  handle: 'operator',
  email: '',
  phone: '',
  title: 'Security Analyst',
  bio: '',
  avatarColor: '#3b82f6',
  avatarUrl: '',
  status: 'online',
  location: '',
  timezone: 'UTC',
  joinedAt: new Date().toISOString(),
}

const STORAGE_KEY = 'cyberweb-profile'

function load(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

function persist(p: UserProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(load)

  const update = useCallback(<K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile(prev => {
      const next = { ...prev, [key]: value }
      persist(next)
      return next
    })
  }, [])

  const updateMany = useCallback((patch: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...patch }
      persist(next)
      return next
    })
  }, [])

  return { profile, update, updateMany }
}

export function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'OP'
}

export const STATUS_CONFIG: Record<UserStatus, { label: string; color: string; dot: string }> = {
  online:  { label: 'Online',           color: 'text-emerald-400', dot: 'bg-emerald-400' },
  away:    { label: 'Away',             color: 'text-amber-400',   dot: 'bg-amber-400' },
  dnd:     { label: 'Do Not Disturb',   color: 'text-rose-400',    dot: 'bg-rose-400' },
  offline: { label: 'Appear Offline',   color: 'text-slate-500',   dot: 'bg-slate-600' },
}

export const AVATAR_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#64748b', // slate
]
