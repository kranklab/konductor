import { useState, useEffect } from 'react'
import type { ChangedFile } from '../types'

const api = window.konductorAPI

export function useFileChanges(sessionId: string | null) {
  const [changes, setChanges] = useState<ChangedFile[]>([])

  useEffect(() => {
    if (!sessionId) {
      setChanges([])
      return
    }

    // Fetch existing changes
    api.getChanges(sessionId).then(setChanges)

    // Subscribe to live updates
    const unsub = api.onFileChanged((id, newChanges) => {
      if (id === sessionId) {
        setChanges(newChanges)
      }
    })

    return unsub
  }, [sessionId])

  return changes
}
