import { contextBridge, ipcRenderer } from 'electron'
import type { ChangedFile } from '../main/fileWatcher'
import type { ActivityState } from '../main/activityWatcher'
import type { SessionInfo } from '../main/sessionManager'
import type { PersistedState } from '../main/store'
import type { WorktreeInfo, BranchDetail, BranchFile } from '../shared/types'
import type { GitHubRepo, GitHubPR, GitHubIssue } from '../shared/types'

export type UpdateStatus = { status: 'available' | 'ready'; version: string }

export interface KonductorAPI {
  loadState: () => Promise<PersistedState>
  saveState: (state: PersistedState) => Promise<void>
  listSessions: () => Promise<SessionInfo[]>
  getScrollback: (sessionId: string) => Promise<string>
  createSession: (
    cwd: string,
    opts?: {
      claudeSessionId?: string
      name?: string
      resume?: boolean
      prompt?: string
      envScript?: string
    }
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
  selectFile: (title?: string) => Promise<string | null>
  listWorktrees: (cwd: string) => Promise<WorktreeInfo[]>
  createWorktree: (
    cwd: string,
    branch: string,
    newBranch: boolean,
    updateFromOrigin?: boolean
  ) => Promise<WorktreeInfo>
  removeWorktree: (repoRoot: string, worktreePath: string) => Promise<void>
  listBranches: (cwd: string) => Promise<string[]>
  getBranchDetails: (cwd: string) => Promise<BranchDetail[]>
  deleteBranch: (cwd: string, branch: string, force: boolean) => Promise<void>
  deleteRemoteBranch: (cwd: string, remote: string, branch: string) => Promise<void>
  fetchPrune: (cwd: string) => Promise<void>
  generateSummary: (cwd: string, claudeSessionId: string) => Promise<string>
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  installUpdate: () => void
  onSessionActivity: (
    cb: (claudeSessionId: string, state: ActivityState, tool: string, summary: string) => void
  ) => () => void
  getGitHubRepo: (cwd: string) => Promise<GitHubRepo | null>
  listPullRequests: (cwd: string, state: string) => Promise<GitHubPR[]>
  listIssues: (cwd: string, state: string) => Promise<GitHubIssue[]>
  openExternal: (url: string) => Promise<void>
  getBranchFiles: (cwd: string, branch: string, worktreePath: string) => Promise<BranchFile[]>
  getBranchDiff: (
    cwd: string,
    branch: string,
    filePath: string,
    source: 'committed' | 'uncommitted',
    worktreePath: string
  ) => Promise<string>
}

const api: KonductorAPI = {
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (state: PersistedState) => ipcRenderer.invoke('save-state', state),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  getScrollback: (sessionId: string) => ipcRenderer.invoke('get-scrollback', sessionId),
  createSession: (
    cwd: string,
    opts?: {
      claudeSessionId?: string
      name?: string
      resume?: boolean
      prompt?: string
      envScript?: string
    }
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

  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (title?: string) => ipcRenderer.invoke('select-file', title),

  listWorktrees: (cwd: string) => ipcRenderer.invoke('list-worktrees', cwd),
  createWorktree: (cwd: string, branch: string, newBranch: boolean, updateFromOrigin?: boolean) =>
    ipcRenderer.invoke('create-worktree', cwd, branch, newBranch, updateFromOrigin ?? false),
  removeWorktree: (repoRoot: string, worktreePath: string) =>
    ipcRenderer.invoke('remove-worktree', repoRoot, worktreePath),
  listBranches: (cwd: string) => ipcRenderer.invoke('list-branches', cwd),
  getBranchDetails: (cwd: string) => ipcRenderer.invoke('get-branch-details', cwd),
  deleteBranch: (cwd: string, branch: string, force: boolean) =>
    ipcRenderer.invoke('delete-branch', cwd, branch, force),
  deleteRemoteBranch: (cwd: string, remote: string, branch: string) =>
    ipcRenderer.invoke('delete-remote-branch', cwd, remote, branch),
  fetchPrune: (cwd: string) => ipcRenderer.invoke('fetch-prune', cwd),

  generateSummary: (cwd: string, claudeSessionId: string) =>
    ipcRenderer.invoke('generate-summary', cwd, claudeSessionId),

  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => {
      cb(status)
    }
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },
  installUpdate: () => ipcRenderer.send('install-update'),

  onSessionActivity: (
    cb: (claudeSessionId: string, state: ActivityState, tool: string, summary: string) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { claudeSessionId: string; state: ActivityState; tool: string; summary: string }
    ): void => {
      cb(payload.claudeSessionId, payload.state, payload.tool, payload.summary || '')
    }
    ipcRenderer.on('session-activity', handler)
    return () => ipcRenderer.removeListener('session-activity', handler)
  },
  getGitHubRepo: (cwd: string) => ipcRenderer.invoke('get-github-repo', cwd),
  listPullRequests: (cwd: string, state: string) =>
    ipcRenderer.invoke('list-pull-requests', cwd, state),
  listIssues: (cwd: string, state: string) => ipcRenderer.invoke('list-issues', cwd, state),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getBranchFiles: (cwd: string, branch: string, worktreePath: string) =>
    ipcRenderer.invoke('get-branch-files', cwd, branch, worktreePath),
  getBranchDiff: (
    cwd: string,
    branch: string,
    filePath: string,
    source: 'committed' | 'uncommitted',
    worktreePath: string
  ) => ipcRenderer.invoke('get-branch-diff', cwd, branch, filePath, source, worktreePath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('konductorAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore -- fallback for non-context-isolated environments
  window.konductorAPI = api
}
