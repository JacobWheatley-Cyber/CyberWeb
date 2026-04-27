import { useState, useCallback } from 'react'

export interface SavedTarget {
  id: string
  name: string
  value: string
  createdAt: string
}

const STORAGE_KEY = 'cyberweb-saved-targets'

function load(): SavedTarget[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function persist(targets: SavedTarget[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(targets))
}

export function useSavedTargets() {
  const [targets, setTargets] = useState<SavedTarget[]>(load)

  const save = useCallback((name: string, value: string) => {
    const entry: SavedTarget = {
      id: Date.now().toString(),
      name: name.trim(),
      value: value.trim(),
      createdAt: new Date().toISOString(),
    }
    setTargets(prev => {
      const next = [...prev, entry]
      persist(next)
      return next
    })
    return entry
  }, [])

  const remove = useCallback((id: string) => {
    setTargets(prev => {
      const next = prev.filter(t => t.id !== id)
      persist(next)
      return next
    })
  }, [])

  return { targets, save, remove }
}
