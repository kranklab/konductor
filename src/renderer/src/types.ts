import type { Terminal } from '@xterm/xterm'
import type { PrInfo } from '../../shared/types'

export type ViewMode = 'grid' | 'focus' | 'branches' | 'github'

export interface Project {
  id: string
  name: string
  cwd: string
  envScript?: string
}

export type ActivityState = 'working' | 'waiting' | 'ready'

export interface Session {
  id: string
  projectId: string
  cwd: string
  title: string
  summary: string
  terminal: Terminal | null
  alive: boolean
  claudeSessionId: string
  activity: ActivityState
  /** Session metadata loaded from disk but not yet spawned */
  dormant: boolean
  /** PR associated with the session's branch (if any) */
  pr?: PrInfo
}

export interface ShellTerminal {
  id: string
  sessionId: string
  terminal: Terminal
  alive: boolean
}

export interface ChangedFile {
  path: string
  type: 'add' | 'change' | 'unlink'
  timestamp: number
}
