import { contextBridge, ipcRenderer } from 'electron'
import type { ChangedFile } from '../main/fileWatcher'
import type { SessionInfo } from '../main/sessionManager'
import type { PersistedState } from '../main/store'

export interface KonductorAPI {
  loadState: () => Promise<PersistedState>
  saveState: (state: PersistedState) => Promise<void>
  listSessions: () => Promise<SessionInfo[]>
  getScrollback: (sessionId: string) => Promise<string>
  createSession: (
    cwd: string,
    opts?: { claudeSessionId?: string; name?: string; resume?: boolean }
  ) => Promise<{ id: string; claudeSessionId: string }>
  killSession: (sessionId: string) => void
  writeToSession: (sessionId: string, data: string) => void
  resizeSession: (sessionId: string, cols: number, rows: number) => void
  onPtyOutput: (cb: (sessionId: string, data: string) => void) => () => void
  onPtyExit: (cb: (sessionId: string, exitCode: number) => void) => () => void
  onFileChanged: (cb: (sessionId: string, changes: ChangedFile[]) => void) => () => void
  getChanges: (sessionId: string) => Promise<ChangedFile[]>
  readFile: (path: string) => Promise<string>
  getDiff: (cwd: string, filePath: string, isUntracked: boolean) => Promise<string>
  selectDirectory: () => Promise<string | null>
}

const api: KonductorAPI = {
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (state: PersistedState) => ipcRenderer.invoke('save-state', state),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  getScrollback: (sessionId: string) => ipcRenderer.invoke('get-scrollback', sessionId),
  createSession: (
    cwd: string,
    opts?: { claudeSessionId?: string; name?: string; resume?: boolean }
  ) => ipcRenderer.invoke('create-session', cwd, opts),

  killSession: (sessionId: string) => ipcRenderer.send('kill-session', sessionId),

  writeToSession: (sessionId: string, data: string) =>
    ipcRenderer.send('write-to-session', sessionId, data),

  resizeSession: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.send('resize-session', sessionId, cols, rows),

  onPtyOutput: (cb: (sessionId: string, data: string) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; data: string }
    ): void => {
      cb(payload.sessionId, payload.data)
    }
    ipcRenderer.on('pty-output', handler)
    return () => ipcRenderer.removeListener('pty-output', handler)
  },

  onPtyExit: (cb: (sessionId: string, exitCode: number) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; exitCode: number }
    ): void => {
      cb(payload.sessionId, payload.exitCode)
    }
    ipcRenderer.on('pty-exit', handler)
    return () => ipcRenderer.removeListener('pty-exit', handler)
  },

  onFileChanged: (cb: (sessionId: string, changes: ChangedFile[]) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; changes: ChangedFile[] }
    ): void => {
      cb(payload.sessionId, payload.changes)
    }
    ipcRenderer.on('file-changed', handler)
    return () => ipcRenderer.removeListener('file-changed', handler)
  },

  getChanges: (sessionId: string) => ipcRenderer.invoke('get-changes', sessionId),

  readFile: (path: string) => ipcRenderer.invoke('read-file', path),

  getDiff: (cwd: string, filePath: string, isUntracked: boolean) =>
    ipcRenderer.invoke('get-diff', cwd, filePath, isUntracked),

  selectDirectory: () => ipcRenderer.invoke('select-directory')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('konductorAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.konductorAPI = api
}
