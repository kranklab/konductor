import type { Terminal } from '@xterm/xterm'

export type ViewMode = 'grid' | 'focus' | 'changes' | 'branches'

export interface Project {
  id: string
  name: string
  cwd: string
}

export interface Session {
  id: string
  projectId: string
  cwd: string
  title: string
  terminal: Terminal
  alive: boolean
  claudeSessionId: string
}

export interface ChangedFile {
  path: string
  type: 'add' | 'change' | 'unlink'
  timestamp: number
}
