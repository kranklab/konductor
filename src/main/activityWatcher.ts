import { watch, type FSWatcher } from 'chokidar'
import { readFile, mkdir } from 'fs/promises'
import { basename } from 'path'
import { BrowserWindow } from 'electron'
import { sessionStateDir } from './sessionManager'

export type ActivityState = 'working' | 'waiting' | 'ready'

let watcher: FSWatcher | null = null

export function startActivityWatcher(window: BrowserWindow): void {
  mkdir(sessionStateDir, { recursive: true }).then(() => {
    watcher = watch(sessionStateDir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 }
    })

    const handleFile = async (filePath: string): Promise<void> => {
      if (!filePath.endsWith('.json')) return
      try {
        const raw = await readFile(filePath, 'utf-8')
        const data = JSON.parse(raw)
        const claudeSessionId = basename(filePath, '.json')
        if (!window.isDestroyed()) {
          window.webContents.send('session-activity', {
            claudeSessionId,
            state: data.state as ActivityState,
            tool: data.tool || '',
            summary: data.summary || '',
            timestamp: data.timestamp
          })
        }
      } catch {
        // File may be mid-write; ignore
      }
    }

    watcher.on('add', handleFile)
    watcher.on('change', handleFile)
  })
}

export function stopActivityWatcher(): void {
  watcher?.close()
  watcher = null
}
