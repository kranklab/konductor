import { useState, useEffect, useMemo } from 'react'
import type { ChangedFile } from '../types'

const api = window.konductorAPI

export function useFileChanges(sessionId: string | null): ChangedFile[] {
  const [changes, setChanges] = useState<ChangedFile[]>([])

  const emptyChanges = useMemo(() => [] as ChangedFile[], [])

  useEffect(() => {
    if (!sessionId) {
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

  return sessionId ? changes : emptyChanges
}
