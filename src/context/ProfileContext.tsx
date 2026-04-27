import { createContext, useContext } from 'react'
import type { UserProfile } from '../hooks/useProfile'

interface ProfileCtx {
  profile: UserProfile
  update: <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => void
  updateMany: (patch: Partial<UserProfile>) => void
}

export const ProfileContext = createContext<ProfileCtx | null>(null)

export function useProfileContext() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfileContext must be used inside ProfileProvider')
  return ctx
}
