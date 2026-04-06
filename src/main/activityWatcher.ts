import { watch, type FSWatcher } from 'chokidar'
import { readFile, mkdir, unlink } from 'fs/promises'
import { basename, join } from 'path'
import { BrowserWindow } from 'electron'
import { sessionStateDir } from './sessionManager'

export type ActivityState = 'working' | 'waiting' | 'ready'

export interface SessionRequest {
  id: string
  type: 'start_session'
  cwd: string
  plan: string
  branch?: string
  timestamp: string
}

let watcher: FSWatcher | null = null
let requestWatcher: FSWatcher | null = null

export function startActivityWatcher(window: BrowserWindow): void {
  mkdir(sessionStateDir, { recursive: true }).then(() => {
    watcher = watch(sessionStateDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 0,
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

  // Watch for MCP session requests in the session-requests/ subdirectory
  const requestDir = join(sessionStateDir, 'session-requests')
  mkdir(requestDir, { recursive: true }).then(() => {
    requestWatcher = watch(requestDir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 }
    })

    const handleRequest = async (filePath: string): Promise<void> => {
      if (!filePath.endsWith('.json')) return
      try {
        const raw = await readFile(filePath, 'utf-8')
        const data = JSON.parse(raw) as SessionRequest
        if (data.type === 'start_session' && data.cwd && data.plan) {
          if (!window.isDestroyed()) {
            window.webContents.send('session-request', {
              cwd: data.cwd,
              plan: data.plan,
              branch: data.branch || undefined
            })
          }
        }
        // Clean up the request file after processing
        await unlink(filePath).catch(() => {})
      } catch {
        // File may be mid-write; ignore
      }
    }

    requestWatcher.on('add', handleRequest)
  })
}

export function stopActivityWatcher(): void {
  watcher?.close()
  watcher = null
  requestWatcher?.close()
  requestWatcher = null
}
