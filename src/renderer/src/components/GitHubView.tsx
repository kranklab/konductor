import { useState, useEffect, useCallback } from 'react'
import type { Project } from '../types'
import type { GitHubPR, GitHubIssue } from '../../../shared/types'
import { ChevronLeftIcon, RefreshIcon } from './Icons'

const api = window.konductorAPI

type Tab = 'prs' | 'issues'
type PRFilter = 'open' | 'closed' | 'merged' | 'all'
type IssueFilter = 'open' | 'closed' | 'all'

interface GitHubViewProps {
  project: Project
  onBack: () => void
  onOpenSession: (branch: string, isNew: boolean, prompt?: string) => void
}

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export default function GitHubView({
  project,
  onBack,
  onOpenSession
}: GitHubViewProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('prs')
  const [prFilter, setPrFilter] = useState<PRFilter>('open')
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('open')
  const [prs, setPrs] = useState<GitHubPR[]>([])
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [repoInfo, setRepoInfo] = useState<{ owner: string; repo: string } | null>(null)

  const loadRepo = useCallback(async () => {
    const repo = await api.getGitHubRepo(project.cwd)
    setRepoInfo(repo)
    return repo
  }, [project.cwd])

  const loadPRs = useCallback(
    async (state: PRFilter) => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.listPullRequests(project.cwd, state)
        setPrs(data)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load pull requests'
        if (msg.includes('ENOENT') || msg.includes('not found')) {
          setError('gh CLI not found. Install it from https://cli.github.com')
        } else {
          setError(msg)
        }
      } finally {
        setLoading(false)
      }
    },
    [project.cwd]
  )

  const loadIssues = useCallback(
    async (state: IssueFilter) => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.listIssues(project.cwd, state)
        setIssues(data)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load issues'
        if (msg.includes('ENOENT') || msg.includes('not found')) {
          setError('gh CLI not found. Install it from https://cli.github.com')
        } else {
          setError(msg)
        }
      } finally {
        setLoading(false)
      }
    },
    [project.cwd]
  )

  useEffect(() => {
    loadRepo().then((repo) => {
      if (!repo) {
        setLoading(false)
        setError('Not a GitHub repository')
        return
      }
      if (tab === 'prs') {
        loadPRs(prFilter)
      } else {
        loadIssues(issueFilter)
      }
    })
    // Only re-run when the project changes — loadPRs/loadIssues/tab/filters
    // are intentionally excluded because this is the initial-load effect.
    // Filter-change effects below handle subsequent updates.
  }, [project.cwd, loadRepo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!repoInfo) return
    if (tab === 'prs') {
      loadPRs(prFilter)
    }
  }, [prFilter, loadPRs, repoInfo, tab])

  useEffect(() => {
    if (!repoInfo) return
    if (tab === 'issues') {
      loadIssues(issueFilter)
    }
  }, [issueFilter, loadIssues, repoInfo, tab])

  const handleTabChange = useCallback(
    (newTab: Tab) => {
      setTab(newTab)
      if (!repoInfo) return
      if (newTab === 'prs' && prs.length === 0) {
        loadPRs(prFilter)
      } else if (newTab === 'issues' && issues.length === 0) {
        loadIssues(issueFilter)
      }
    },
    [repoInfo, prs.length, issues.length, prFilter, issueFilter, loadPRs, loadIssues]
  )

  const handleRefresh = useCallback(() => {
    if (!repoInfo) return
    if (tab === 'prs') {
      loadPRs(prFilter)
    } else {
      loadIssues(issueFilter)
    }
  }, [repoInfo, tab, prFilter, issueFilter, loadPRs, loadIssues])

  const handleOpen = useCallback((url: string) => {
    api.openExternal(url)
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          title="Back to grid"
        >
          <ChevronLeftIcon />
        </button>
        <h2 className="text-sm font-semibold text-gray-200">GitHub</h2>
        <span className="text-xs text-gray-600">{project.name}</span>
        {repoInfo && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised border border-surface-border text-gray-400">
            {repoInfo.owner}/{repoInfo.repo}
          </span>
        )}
        <div className="flex-1" />

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-surface-raised border border-surface-border text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors"
          title="Refresh"
        >
          <RefreshIcon />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-surface-border">
        <button
          onClick={() => handleTabChange('prs')}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${
            tab === 'prs' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Pull Requests{tab === 'prs' && !loading ? ` (${prs.length})` : ''}
        </button>
        <button
          onClick={() => handleTabChange('issues')}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${
            tab === 'issues' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Issues{tab === 'issues' && !loading ? ` (${issues.length})` : ''}
        </button>

        <div className="flex-1" />

        {/* State filters */}
        {tab === 'prs' && (
          <div className="flex items-center gap-1">
            {(['open', 'closed', 'merged', 'all'] as PRFilter[]).map((state) => (
              <button
                key={state}
                onClick={() => setPrFilter(state)}
                className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-colors ${
                  prFilter === state
                    ? 'bg-accent/20 text-accent'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {state}
              </button>
            ))}
          </div>
        )}
        {tab === 'issues' && (
          <div className="flex items-center gap-1">
            {(['open', 'closed', 'all'] as IssueFilter[]).map((state) => (
              <button
                key={state}
                onClick={() => setIssueFilter(state)}
                className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-colors ${
                  issueFilter === state
                    ? 'bg-accent/20 text-accent'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {state}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Loading...
        </div>
      ) : error ? (
        <div className="flex-1" />
      ) : tab === 'prs' ? (
        <div className="flex-1 overflow-y-auto">
          {/* PR table header */}
          <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-600 border-b border-surface-border sticky top-0 bg-surface z-10">
            <div className="w-12">#</div>
            <div className="flex-1">Title</div>
            <div className="w-28">Branch</div>
            <div className="w-20">Author</div>
            <div className="w-16">Status</div>
            <div className="w-20">Updated</div>
            <div className="w-16 text-right">Action</div>
          </div>

          {prs.map((pr) => (
            <PRRow key={pr.number} pr={pr} onOpen={handleOpen} onOpenSession={onOpenSession} />
          ))}

          {prs.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-600 text-sm">
              No pull requests found.
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Issue table header */}
          <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-600 border-b border-surface-border sticky top-0 bg-surface z-10">
            <div className="w-12">#</div>
            <div className="flex-1">Title</div>
            <div className="w-24">Author</div>
            <div className="w-24">Assignees</div>
            <div className="w-20">Updated</div>
            <div className="w-16 text-right">Action</div>
          </div>

          {issues.map((issue) => (
            <IssueRow
              key={issue.number}
              issue={issue}
              onOpen={handleOpen}
              onOpenSession={onOpenSession}
            />
          ))}

          {issues.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-600 text-sm">No issues found.</div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---- PR row component ---- */

function PRRow({
  pr,
  onOpen,
  onOpenSession
}: {
  pr: GitHubPR
  onOpen: (url: string) => void
  onOpenSession: (branch: string, isNew: boolean, prompt?: string) => void
}): React.JSX.Element {
  const stateColor =
    pr.state === 'open'
      ? 'text-green-400'
      : pr.state === 'merged'
        ? 'text-purple-400'
        : 'text-red-400'

  const checkColor =
    pr.statusCheck === 'success'
      ? 'bg-green-400'
      : pr.statusCheck === 'failure'
        ? 'bg-red-400'
        : pr.statusCheck === 'pending'
          ? 'bg-yellow-400'
          : 'bg-gray-600'

  return (
    <button
      onClick={() => onOpen(pr.url)}
      className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-surface-border/50 hover:bg-surface-raised/50 transition-colors text-left"
    >
      {/* Number */}
      <div className={`w-12 text-xs font-medium ${stateColor}`}>#{pr.number}</div>

      {/* Title + labels */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-200 truncate">{pr.title}</span>
          {pr.labels.map((label) => (
            <span
              key={label}
              className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 shrink-0"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Branch */}
      <div className="w-28 text-[10px] text-gray-500 truncate" title={pr.branch}>
        {pr.branch}
      </div>

      {/* Author */}
      <div className="w-20 text-[10px] text-gray-500 truncate">{pr.author}</div>

      {/* Status check */}
      <div className="w-16 flex items-center gap-1.5">
        {pr.statusCheck && (
          <>
            <div className={`w-1.5 h-1.5 rounded-full ${checkColor}`} />
            <span className="text-[10px] text-gray-500">{pr.statusCheck}</span>
          </>
        )}
      </div>

      {/* Updated */}
      <div className="w-20 text-[10px] text-gray-500" title={pr.updatedAt}>
        {relativeTime(pr.updatedAt)}
      </div>

      {/* Open Session */}
      <div className="w-16 flex justify-end">
        {pr.branch && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const labels = pr.labels.length > 0 ? ` Labels: ${pr.labels.join(', ')}.` : ''
              const prompt = `You are working on PR #${pr.number}: "${pr.title}" (branch: ${pr.branch}, by @${pr.author}).${labels} Review the changes on this branch and help me with this PR.`
              onOpenSession(pr.branch, false, prompt)
            }}
            className="text-[10px] px-2 py-1 rounded bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
            title={`Open session on ${pr.branch}`}
          >
            Session
          </button>
        )}
      </div>
    </button>
  )
}

/* ---- Issue row component ---- */

function IssueRow({
  issue,
  onOpen,
  onOpenSession
}: {
  issue: GitHubIssue
  onOpen: (url: string) => void
  onOpenSession: (branch: string, isNew: boolean, prompt?: string) => void
}): React.JSX.Element {
  const stateColor = issue.state === 'open' ? 'text-green-400' : 'text-red-400'

  return (
    <button
      onClick={() => onOpen(issue.url)}
      className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-surface-border/50 hover:bg-surface-raised/50 transition-colors text-left"
    >
      {/* Number */}
      <div className={`w-12 text-xs font-medium ${stateColor}`}>#{issue.number}</div>

      {/* Title + labels */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-200 truncate">{issue.title}</span>
          {issue.labels.map((label) => (
            <span
              key={label}
              className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 shrink-0"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Author */}
      <div className="w-24 text-[10px] text-gray-500 truncate">{issue.author}</div>

      {/* Assignees */}
      <div className="w-24 text-[10px] text-gray-500 truncate">
        {issue.assignees.length > 0 ? (
          issue.assignees.join(', ')
        ) : (
          <span className="text-gray-700 italic">unassigned</span>
        )}
      </div>

      {/* Updated */}
      <div className="w-20 text-[10px] text-gray-500" title={issue.updatedAt}>
        {relativeTime(issue.updatedAt)}
      </div>

      {/* Open Session */}
      <div className="w-16 flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation()
            const slug = issue.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .slice(0, 30)
            const branch = `issue-${issue.number}-${slug}`
            const labels = issue.labels.length > 0 ? ` Labels: ${issue.labels.join(', ')}.` : ''
            const prompt = `You are working on Issue #${issue.number}: "${issue.title}" (by @${issue.author}).${labels} Help me implement a solution for this issue.`
            onOpenSession(branch, true, prompt)
          }}
          className="text-[10px] px-2 py-1 rounded bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
          title={`Create branch and open session for #${issue.number}`}
        >
          Session
        </button>
      </div>
    </button>
  )
}
