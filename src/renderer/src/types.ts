import type { Terminal } from '@xterm/xterm'

export type ViewMode = 'grid' | 'focus' | 'changes' | 'branches' | 'github'

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
}

export interface ChangedFile {
  path: string
  type: 'add' | 'change' | 'unlink'
  timestamp: number
}
