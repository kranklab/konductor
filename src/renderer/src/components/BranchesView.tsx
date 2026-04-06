import { useState, useEffect, useCallback } from 'react'
import type { Project } from '../types'
import type { BranchDetail, WorktreeInfo } from '../../../shared/types'
import { ChevronLeftIcon, RefreshIcon } from './Icons'

const api = window.konductorAPI

type Filter = 'all' | 'stale' | 'merged' | 'worktrees'

interface BranchesViewProps {
  project: Project
  onBack: () => void
}

export default function BranchesView({ project, onBack }: BranchesViewProps): React.JSX.Element {
  const [branches, setBranches] = useState<BranchDetail[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [pruning, setPruning] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{
    branch: string
    force: boolean
    hasWorktree: boolean
  } | null>(null)

  const loadData = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const [br, wt] = await Promise.all([
        api.getBranchDetails(project.cwd),
        api.listWorktrees(project.cwd)
      ])
      if (signal?.cancelled) return
      setBranches(br)
      setWorktrees(wt)
      setSelected(new Set())
    } catch (e) {
      if (signal?.cancelled) return
      setError(e instanceof Error ? e.message : 'Failed to load branch data')
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }, [project.cwd])

  useEffect(() => {
    const signal = { cancelled: false }
    loadData(signal)
    return () => {
      signal.cancelled = true
    }
  }, [loadData])

  const showAction = useCallback((msg: string) => {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(null), 3000)
  }, [])

  const handleFetchPrune = useCallback(async () => {
    setPruning(true)
    setError(null)
    try {
      await api.fetchPrune(project.cwd)
      showAction('Fetched & pruned remote tracking refs')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch --prune')
    } finally {
      setPruning(false)
    }
  }, [project.cwd, loadData, showAction])

  const removeBranch = useCallback((name: string) => {
    setBranches((prev) => prev.filter((b) => b.name !== name))
    setWorktrees((prev) => prev.filter((w) => w.branch !== name))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
  }, [])

  const clearWorktreeFromBranch = useCallback((worktreePath: string) => {
    setBranches((prev) =>
      prev.map((b) => (b.worktreePath === worktreePath ? { ...b, worktreePath: '' } : b))
    )
    setWorktrees((prev) => prev.filter((w) => w.path !== worktreePath))
  }, [])

  const handleDeleteBranch = useCallback(
    async (branch: string, force: boolean) => {
      setDeleting(branch)
      setConfirmDelete(null)
      setError(null)
      try {
        const branchInfo = branches.find((b) => b.name === branch)
        if (branchInfo?.worktreePath) {
          await api.removeWorktree(project.cwd, branchInfo.worktreePath)
        }
        await api.deleteBranch(project.cwd, branch, force)
        removeBranch(branch)
        showAction(`Deleted branch ${branch}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to delete branch'
        if (msg.includes('not fully merged') && !force) {
          setConfirmDelete({ branch, force: true, hasWorktree: false })
        } else {
          setError(msg)
        }
      } finally {
        setDeleting(null)
      }
    },
    [project.cwd, branches, removeBranch, showAction]
  )

  const handleRemoveWorktree = useCallback(
    async (worktreePath: string) => {
      setError(null)
      try {
        await api.removeWorktree(project.cwd, worktreePath)
        clearWorktreeFromBranch(worktreePath)
        showAction('Removed worktree')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to remove worktree')
      }
    },
    [project.cwd, clearWorktreeFromBranch, showAction]
  )

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return
    setError(null)
    const deleted: string[] = []
    for (const branch of selected) {
      try {
        const branchInfo = branches.find((b) => b.name === branch)
        if (branchInfo?.worktreePath) {
          await api.removeWorktree(project.cwd, branchInfo.worktreePath)
        }
        await api.deleteBranch(project.cwd, branch, true)
        deleted.push(branch)
      } catch {
        // continue with others
      }
    }
    for (const name of deleted) removeBranch(name)
    showAction(`Deleted ${deleted.length} branch${deleted.length !== 1 ? 'es' : ''}`)
  }, [selected, branches, project.cwd, removeBranch, showAction])

  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const STALE_DAYS = 3

  // A branch is only stale if there's no active local work (dirty files override everything).
  // If clean, stale when:
  // 1. PR merged or closed (work is done or abandoned)
  // 2. Remote tracking ref gone (branch deleted on remote)
  // 3. No commits ahead of main (nothing unique on this branch)
  // 4. Last commit older than STALE_DAYS (abandoned work)
  const isStale = (b: BranchDetail): boolean => {
    // Active uncommitted work — never stale
    if (b.dirty) return false

    if (b.pr.state === 'merged' || b.pr.state === 'closed') return true
    if (b.gone) return true
    if (b.aheadCount === 0) return true
    if (b.lastCommitDate) {
      const ageMs = Date.now() - new Date(b.lastCommitDate).getTime()
      const ageDays = ageMs / (1000 * 60 * 60 * 24)
      if (ageDays > STALE_DAYS) return true
    }
    return false
  }

  const staleReason = (b: BranchDetail): string => {
    if (b.pr.state === 'merged') return `PR #${b.pr.number} merged`
    if (b.pr.state === 'closed') return `PR #${b.pr.number} closed without merging`
    if (b.gone) return 'Remote branch deleted — likely merged'
    if (b.aheadCount === 0) return 'No commits ahead of main'
    if (b.lastCommitDate) {
      const ageMs = Date.now() - new Date(b.lastCommitDate).getTime()
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
      if (ageDays > STALE_DAYS) return `Last commit ${ageDays} days ago`
    }
    return ''
  }

  // Filter logic
  const filteredBranches = branches.filter((b) => {
    if (filter === 'stale') return isStale(b)
    if (filter === 'worktrees') return b.worktreePath !== ''
    return true
  })

  // Separate: HEAD branch first, then the rest
  const headBranch = filteredBranches.find((b) => b.isHead)
  const otherBranches = filteredBranches.filter((b) => !b.isHead)

  const staleBranches = branches.filter(isStale)
  const worktreeBranches = branches.filter((b) => b.worktreePath)

  // Selectable = not HEAD, not main worktree
  const mainWorktree = worktrees.find((w) => w.isMain)
  const canSelect = (b: BranchDetail): boolean => !b.isHead && b.name !== mainWorktree?.branch

  const selectableFiltered = otherBranches.filter(canSelect)
  const allSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((b) => selected.has(b.name))

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableFiltered.map((b) => b.name)))
    }
  }, [allSelected, selectableFiltered])

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
        <h2 className="text-sm font-semibold text-gray-200">Branches & Worktrees</h2>
        <span className="text-xs text-gray-600">{project.name}</span>
        <div className="flex-1" />

        {/* Counts */}
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-gray-500">
            {branches.length} branch{branches.length !== 1 ? 'es' : ''}
          </span>
          {staleBranches.length > 0 && (
            <span className="text-amber-400">{staleBranches.length} stale</span>
          )}
          <span className="text-gray-500">
            {worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}
          </span>
        </div>

        <button
          onClick={handleFetchPrune}
          disabled={pruning}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-surface-raised border border-surface-border text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors"
          title="git fetch --prune"
        >
          <RefreshIcon />
          {pruning ? 'Fetching...' : 'Fetch & Prune'}
        </button>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
          {actionMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Filter tabs + bulk actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-border">
        {(
          [
            ['all', `All (${branches.length})`],
            ['stale', `Stale (${staleBranches.length})`],
            ['worktrees', `Worktrees (${worktreeBranches.length})`]
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-colors ${
              filter === key ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="flex-1" />

        {filter === 'stale' && staleBranches.length > 0 && selected.size === 0 && (
          <button
            onClick={() => {
              const staleNames = staleBranches.filter(canSelect).map((b) => b.name)
              setSelected(new Set(staleNames))
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
          >
            Select all stale ({staleBranches.filter(canSelect).length})
          </button>
        )}

        {selected.size > 0 && (
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
          >
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Loading...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-600 border-b border-surface-border sticky top-0 bg-surface z-10">
            <div className="w-5 flex items-center justify-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="accent-accent w-3 h-3"
              />
            </div>
            <div className="flex-1">Branch</div>
            <div className="w-32">Upstream</div>
            <div className="w-28">Last Commit</div>
            <div className="w-20 text-right">Actions</div>
          </div>

          {/* HEAD branch */}
          {headBranch && (
            <BranchRow
              branch={headBranch}
              projectCwd={project.cwd}
              isMainWorktree={headBranch.name === mainWorktree?.branch}
              stale={false}
              staleReasonText=""
              selected={false}
              canSelect={false}
              deleting={deleting === headBranch.name}
              onToggle={() => {}}
              onDelete={() => {}}
              onRemoveWorktree={() => {}}
            />
          )}

          {/* Other branches */}
          {otherBranches.map((b) => (
            <BranchRow
              key={b.name}
              branch={b}
              projectCwd={project.cwd}
              isMainWorktree={b.name === mainWorktree?.branch}
              stale={isStale(b)}
              staleReasonText={staleReason(b)}
              selected={selected.has(b.name)}
              canSelect={canSelect(b)}
              deleting={deleting === b.name}
              onToggle={() => toggleSelect(b.name)}
              onDelete={(force) => {
                if (b.worktreePath && !force) {
                  setConfirmDelete({
                    branch: b.name,
                    force: false,
                    hasWorktree: true
                  })
                } else {
                  handleDeleteBranch(b.name, force)
                }
              }}
              onRemoveWorktree={() => handleRemoveWorktree(b.worktreePath)}
            />
          ))}

          {filteredBranches.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-600 text-sm">
              {filter === 'stale'
                ? 'No stale branches found. Try "Fetch & Prune" to sync with remote.'
                : filter === 'worktrees'
                  ? 'No worktrees found.'
                  : 'No branches found.'}
            </div>
          )}

          {/* Worktrees without a local branch (orphaned) */}
          {filter === 'worktrees' && (
            <>
              {worktrees
                .filter((w) => !w.isMain && !branches.some((b) => b.name === w.branch))
                .map((wt) => (
                  <div
                    key={wt.path}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-border/50 hover:bg-surface-raised/50 transition-colors"
                  >
                    <div className="w-5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 italic">
                          {wt.branch || '(detached)'}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          orphaned worktree
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-600 truncate mt-0.5">{wt.path}</div>
                    </div>
                    <div className="w-32" />
                    <div className="w-28" />
                    <div className="w-20 flex justify-end">
                      <button
                        onClick={() => handleRemoveWorktree(wt.path)}
                        className="text-[10px] px-2 py-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Remove worktree"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      )}

      {/* Confirm force-delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-overlay border border-surface-border rounded-lg w-[360px] shadow-2xl">
            <div className="px-4 py-3 border-b border-surface-border">
              <h2 className="text-sm font-semibold text-gray-200">Confirm Delete</h2>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-gray-300 mb-1">
                Branch: <span className="text-white font-medium">{confirmDelete.branch}</span>
              </p>
              {confirmDelete.hasWorktree && (
                <p className="text-xs text-amber-400 mb-3">
                  This branch has an active worktree that will also be removed.
                </p>
              )}
              {confirmDelete.force && !confirmDelete.hasWorktree && (
                <p className="text-xs text-amber-400 mb-3">
                  This branch is not fully merged. Force delete?
                </p>
              )}
              <div className="flex flex-col gap-2 mt-3">
                <button
                  onClick={() => handleDeleteBranch(confirmDelete.branch, confirmDelete.force)}
                  className="w-full py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 text-xs font-medium transition-colors"
                >
                  {confirmDelete.force ? 'Force Delete' : 'Delete Branch & Worktree'}
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="w-full py-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- Branch row component ---- */

interface BranchRowProps {
  branch: BranchDetail
  projectCwd: string
  isMainWorktree: boolean
  stale: boolean
  staleReasonText: string
  selected: boolean
  canSelect: boolean
  deleting: boolean
  onToggle: () => void
  onDelete: (force: boolean) => void
  onRemoveWorktree: () => void
}

type DiffLine = { type: 'add' | 'remove' | 'context' | 'header'; text: string }

interface BranchFileInfo {
  path: string
  status: 'A' | 'M' | 'D' | 'R' | 'U'
  source: 'committed' | 'uncommitted'
}

function parseDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) {
      lines.push({ type: 'header', text: line })
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({ type: 'add', text: line.substring(1) })
    } else if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('\\')
    ) {
      // skip metadata
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({ type: 'remove', text: line.substring(1) })
    } else {
      lines.push({ type: 'context', text: line.startsWith(' ') ? line.substring(1) : line })
    }
  }
  return lines
}

const statusColors: Record<string, string> = {
  A: 'text-green-400',
  M: 'text-yellow-400',
  D: 'text-red-400',
  R: 'text-blue-400',
  U: 'text-orange-400'
}

function BranchDetails({
  branch,
  projectCwd
}: {
  branch: BranchDetail
  projectCwd: string
}): React.JSX.Element {
  const [files, setFiles] = useState<BranchFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<BranchFileInfo | null>(null)
  const [diffResult, setDiffResult] = useState<{ path: string; lines: DiffLine[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getBranchFiles(projectCwd, branch.name, branch.worktreePath)
      .then((f) => {
        if (!cancelled) {
          setFiles(f)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectCwd, branch.name, branch.worktreePath])

  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false
    api
      .getBranchDiff(
        projectCwd,
        branch.name,
        selectedFile.path,
        selectedFile.source,
        branch.worktreePath
      )
      .then((raw) => {
        if (!cancelled) {
          setDiffResult({ path: selectedFile.path, lines: parseDiff(raw) })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiffResult({
            path: selectedFile.path,
            lines: [{ type: 'context', text: '(unable to load diff)' }]
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedFile, projectCwd, branch.name, branch.worktreePath])

  const diffLoading = selectedFile != null && diffResult?.path !== selectedFile.path
  const diffLines = selectedFile && diffResult?.path === selectedFile.path ? diffResult.lines : []

  // Group files by directory
  const committedFiles = files.filter((f) => f.source === 'committed')
  const uncommittedFiles = files.filter((f) => f.source === 'uncommitted')

  if (loading) {
    return <div className="px-8 py-3 text-xs text-gray-500">Loading files...</div>
  }

  if (files.length === 0) {
    return <div className="px-8 py-3 text-xs text-gray-600">No changed files</div>
  }

  return (
    <div className="flex border-t border-surface-border/30" style={{ height: 280 }}>
      {/* File tree */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-surface-border/30 py-1">
        {committedFiles.length > 0 && (
          <>
            <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-gray-600">
              Committed ({committedFiles.length})
            </div>
            {committedFiles.map((f) => (
              <button
                key={'c:' + f.path}
                onClick={() => setSelectedFile(f)}
                className={`w-full text-left px-3 py-0.5 text-xs font-mono flex items-center gap-2 transition-colors ${
                  selectedFile === f
                    ? 'bg-accent/20 text-white'
                    : 'text-gray-400 hover:bg-surface-raised/50'
                }`}
              >
                <span
                  className={`${statusColors[f.status] || 'text-gray-500'} font-bold w-3 shrink-0 text-[10px]`}
                >
                  {f.status}
                </span>
                <span className="truncate text-[11px]">{f.path}</span>
              </button>
            ))}
          </>
        )}
        {uncommittedFiles.length > 0 && (
          <>
            <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-blue-400/60 mt-1">
              Uncommitted ({uncommittedFiles.length})
            </div>
            {uncommittedFiles.map((f) => (
              <button
                key={'u:' + f.path}
                onClick={() => setSelectedFile(f)}
                className={`w-full text-left px-3 py-0.5 text-xs font-mono flex items-center gap-2 transition-colors ${
                  selectedFile === f
                    ? 'bg-accent/20 text-white'
                    : 'text-gray-400 hover:bg-surface-raised/50'
                }`}
              >
                <span
                  className={`${statusColors[f.status] || 'text-gray-500'} font-bold w-3 shrink-0 text-[10px]`}
                >
                  {f.status}
                </span>
                <span className="truncate text-[11px]">{f.path}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Diff view */}
      <div className="flex-1 overflow-auto bg-surface-raised">
        {selectedFile ? (
          <>
            <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-surface-border/30 sticky top-0 bg-surface-raised font-mono">
              {selectedFile.path}
              <span className="ml-2 text-gray-600">({selectedFile.source})</span>
            </div>
            {diffLoading ? (
              <div className="p-4 text-gray-500 text-xs">Loading diff...</div>
            ) : diffLines.length === 0 ? (
              <div className="p-4 text-gray-500 text-xs">No diff available</div>
            ) : (
              <div className="text-xs font-mono">
                {diffLines.map((line, i) => {
                  if (line.type === 'header') {
                    return (
                      <div
                        key={i}
                        className="px-3 py-0.5 text-blue-400 bg-blue-400/5 border-y border-blue-400/10"
                      >
                        {line.text}
                      </div>
                    )
                  }
                  const bg =
                    line.type === 'add'
                      ? 'bg-green-400/10'
                      : line.type === 'remove'
                        ? 'bg-red-400/10'
                        : ''
                  const markerColor =
                    line.type === 'add'
                      ? 'text-green-400'
                      : line.type === 'remove'
                        ? 'text-red-400'
                        : 'text-transparent'
                  const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
                  return (
                    <div key={i} className={`flex ${bg}`}>
                      <span className={`shrink-0 w-5 text-center select-none ${markerColor}`}>
                        {marker}
                      </span>
                      <span className="px-2 whitespace-pre-wrap break-all text-gray-300">
                        {line.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            Select a file to view diff
          </div>
        )}
      </div>
    </div>
  )
}

function BranchRow({
  branch,
  projectCwd,
  isMainWorktree,
  stale,
  staleReasonText,
  selected,
  canSelect,
  deleting,
  onToggle,
  onDelete,
  onRemoveWorktree
}: BranchRowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const hasFiles = branch.aheadCount > 0 || branch.dirty

  return (
    <div className={`border-b border-surface-border/50 ${deleting ? 'opacity-40' : ''}`}>
      <div
        className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
          selected ? 'bg-accent/5' : stale ? 'bg-amber-500/[0.03]' : 'hover:bg-surface-raised/50'
        }`}
      >
        {/* Checkbox */}
        <div className="w-5 flex items-center justify-center">
          {canSelect ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              className="accent-accent w-3 h-3"
            />
          ) : (
            <div className="w-3" />
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => hasFiles && setExpanded((p) => !p)}
          className={`w-4 flex items-center justify-center ${hasFiles ? 'text-gray-500 hover:text-gray-300' : 'text-gray-700 cursor-default'}`}
          title={
            hasFiles ? (expanded ? 'Collapse details' : 'Show changed files') : 'No changed files'
          }
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="currentColor"
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
        </button>

        {/* Branch name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs truncate ${branch.isHead ? 'text-accent font-semibold' : stale ? 'text-gray-400' : 'text-gray-200'}`}
            >
              {branch.name}
            </span>

            {branch.isHead && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 cursor-help"
                title="HEAD: The currently checked-out branch in this worktree"
              >
                HEAD
              </span>
            )}

            {branch.remoteOnly && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 cursor-help"
                title="Remote: This branch only exists on the remote — no local checkout"
              >
                remote
              </span>
            )}

            {stale && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-help"
                title={`Stale: ${staleReasonText}`}
              >
                stale
              </span>
            )}

            {branch.gone && !stale && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-help"
                title="Gone: The remote tracking branch no longer exists — it was likely deleted after merging"
              >
                gone
              </span>
            )}

            {branch.worktreePath && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded border cursor-help ${
                  stale
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-green-500/10 text-green-400 border-green-500/20'
                }`}
                title="Worktree: This branch is checked out in a separate working directory for parallel development"
              >
                worktree
              </span>
            )}

            {branch.dirty && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 cursor-help"
                title="Dirty: This worktree has uncommitted changes — modified, added, or deleted files that haven't been committed yet"
              >
                dirty
              </span>
            )}

            {!isMainWorktree && branch.aheadCount > 0 && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 cursor-help"
                title={`Ahead: This branch has ${branch.aheadCount} commit${branch.aheadCount !== 1 ? 's' : ''} not yet merged into main`}
              >
                +{branch.aheadCount} ahead
              </span>
            )}

            {branch.pr.state === 'open' && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 cursor-help"
                title={`Open PR: Pull request #${branch.pr.number} is open and in review`}
              >
                PR #{branch.pr.number}
              </span>
            )}

            {branch.pr.state === 'merged' && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 cursor-help"
                title={`Merged: Pull request #${branch.pr.number} has been merged — branch can be cleaned up`}
              >
                PR #{branch.pr.number} merged
              </span>
            )}

            {branch.pr.state === 'closed' && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20 cursor-help"
                title={`Closed: Pull request #${branch.pr.number} was closed without merging`}
              >
                PR #{branch.pr.number} closed
              </span>
            )}

            {isMainWorktree && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-surface-raised text-gray-500 border border-surface-border cursor-help"
                title="Main: The primary worktree (original repo checkout) — cannot be removed"
              >
                main
              </span>
            )}
          </div>

          {/* Stale reason */}
          {stale && staleReasonText && (
            <div className="text-[10px] text-amber-400/60 mt-0.5">{staleReasonText}</div>
          )}

          {/* Commit subject */}
          <div className="text-[10px] text-gray-600 truncate mt-0.5">
            {branch.lastCommitSubject}
          </div>

          {/* Worktree path */}
          {branch.worktreePath && (
            <div className="text-[10px] text-gray-600 truncate mt-0.5">{branch.worktreePath}</div>
          )}
        </div>

        {/* Upstream */}
        <div className="w-32 text-[10px] text-gray-500 truncate">
          {branch.upstream || <span className="text-gray-700 italic">no upstream</span>}
        </div>

        {/* Last commit */}
        <div className="w-28 text-[10px] text-gray-500" title={branch.lastCommitDate}>
          {branch.lastCommitRelative}
        </div>

        {/* Actions */}
        <div className="w-20 flex justify-end gap-1">
          {branch.worktreePath && !isMainWorktree && (
            <button
              onClick={onRemoveWorktree}
              className="text-[10px] px-1.5 py-1 rounded text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              title="Remove worktree"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 4h10M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1M6 7v5M10 7v5M4 4l.8 9a1 1 0 001 .9h4.4a1 1 0 001-.9L12 4" />
              </svg>
            </button>
          )}

          {canSelect && !isMainWorktree && (
            <button
              onClick={() => onDelete(false)}
              disabled={deleting}
              className="text-[10px] px-1.5 py-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              title="Delete branch"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expandable details panel */}
      {expanded && <BranchDetails branch={branch} projectCwd={projectCwd} />}
    </div>
  )
}
