// Shared types used across main, preload, and renderer processes.

// ─── GitHub ──────────────────────────────────────────────────────────

export interface GitHubRepo {
  owner: string
  repo: string
}

export interface GitHubPR {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  author: string
  branch: string
  labels: string[]
  statusCheck: string
  url: string
  createdAt: string
  updatedAt: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  author: string
  labels: string[]
  assignees: string[]
  url: string
  createdAt: string
  updatedAt: string
}

// ─── Worktree / Branch ──────────────────────────────────────────────

export interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
}

export type PrState = 'open' | 'merged' | 'closed' | 'none'

export interface PrInfo {
  state: PrState
  number: number
  url: string
}

export interface BranchDetail {
  name: string
  isHead: boolean
  upstream: string
  gone: boolean
  lastCommitDate: string
  lastCommitRelative: string
  lastCommitSubject: string
  worktreePath: string
  aheadCount: number
  dirty: boolean
  pr: PrInfo
}

export interface BranchFile {
  path: string
  status: 'A' | 'M' | 'D' | 'R' | 'U'
  source: 'committed' | 'uncommitted'
}
