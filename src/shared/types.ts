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
  body: string
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

export interface IssueInfo {
  number: number
  url: string
}

// ─── PR Detail ─────────────────────────────────────────────────────

export interface PrComment {
  author: string
  body: string
  createdAt: string
  path?: string // file path for review comments
  line?: number // line number for review comments
}

export interface PrCheckRun {
  name: string
  status: string // 'completed' | 'in_progress' | 'queued' etc.
  conclusion: string // 'success' | 'failure' | 'neutral' | 'skipped' | ''
  url: string
}

export interface PrDetail {
  number: number
  title: string
  state: PrState
  author: string
  body: string
  branch: string
  baseBranch: string
  additions: number
  deletions: number
  commits: number
  labels: string[]
  url: string
  createdAt: string
  updatedAt: string
  comments: PrComment[]
  checks: PrCheckRun[]
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
  remoteOnly: boolean
}

export interface BranchFile {
  path: string
  status: 'A' | 'M' | 'D' | 'R' | 'U'
  source: 'committed' | 'uncommitted'
}
