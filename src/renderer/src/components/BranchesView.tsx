import { useState, useEffect, useCallback } from 'react'
import type { Project } from '../types'

const api = window.konductorAPI

interface BranchDetail {
  name: string
  isHead: boolean
  upstream: string
  gone: boolean
  lastCommitDate: string
  lastCommitRelative: string
  lastCommitSubject: string
  worktreePath: string
}

interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
}

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

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [br, wt] = await Promise.all([
        api.getBranchDetails(project.cwd),
        api.listWorktrees(project.cwd)
      ])
      setBranches(br)
      setWorktrees(wt)
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load branch data')
    } finally {
      setLoading(false)
    }
  }, [project.cwd])

  useEffect(() => {
    loadData()
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

  const handleDeleteBranch = useCallback(
    async (branch: string, force: boolean) => {
      setDeleting(branch)
      setConfirmDelete(null)
      setError(null)
      try {
        // If the branch has a worktree, remove it first
        const branchInfo = branches.find((b) => b.name === branch)
        if (branchInfo?.worktreePath) {
          await api.removeWorktree(project.cwd, branchInfo.worktreePath)
        }
        await api.deleteBranch(project.cwd, branch, force)
        showAction(`Deleted branch ${branch}`)
        await loadData()
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
    [project.cwd, branches, loadData, showAction]
  )

  const handleRemoveWorktree = useCallback(
    async (worktreePath: string) => {
      setError(null)
      try {
        await api.removeWorktree(project.cwd, worktreePath)
        showAction('Removed worktree')
        await loadData()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to remove worktree')
      }
    },
    [project.cwd, loadData, showAction]
  )

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return
    setError(null)
    let deleted = 0
    for (const branch of selected) {
      try {
        const branchInfo = branches.find((b) => b.name === branch)
        if (branchInfo?.worktreePath) {
          await api.removeWorktree(project.cwd, branchInfo.worktreePath)
        }
        await api.deleteBranch(project.cwd, branch, true)
        deleted++
      } catch {
        // continue with others
      }
    }
    showAction(`Deleted ${deleted} branch${deleted !== 1 ? 'es' : ''}`)
    await loadData()
  }, [selected, branches, project.cwd, loadData, showAction])

  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  // Filter logic
  const filteredBranches = branches.filter((b) => {
    if (filter === 'stale') return b.gone
    if (filter === 'worktrees') return b.worktreePath !== ''
    return true
  })

  // Separate: HEAD branch first, then the rest
  const headBranch = filteredBranches.find((b) => b.isHead)
  const otherBranches = filteredBranches.filter((b) => !b.isHead)

  const staleBranches = branches.filter((b) => b.gone)
  const worktreeBranches = branches.filter((b) => b.worktreePath)

  // Selectable = not HEAD, not main worktree
  const mainWorktree = worktrees.find((w) => w.isMain)
  const canSelect = (b: BranchDetail): boolean =>
    !b.isHead && b.name !== mainWorktree?.branch

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
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
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
            <span className="text-amber-400">
              {staleBranches.length} stale
            </span>
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
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48" />
            <path d="M14 2v4h-4M2 14v-4h4" />
          </svg>
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
              filter === key
                ? 'bg-accent/20 text-accent'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="flex-1" />

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
              isMainWorktree={headBranch.name === mainWorktree?.branch}
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
              isMainWorktree={b.name === mainWorktree?.branch}
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
  isMainWorktree: boolean
  selected: boolean
  canSelect: boolean
  deleting: boolean
  onToggle: () => void
  onDelete: (force: boolean) => void
  onRemoveWorktree: () => void
}

function BranchRow({
  branch,
  isMainWorktree,
  selected,
  canSelect,
  deleting,
  onToggle,
  onDelete,
  onRemoveWorktree
}: BranchRowProps): React.JSX.Element {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-surface-border/50 transition-colors ${
        selected ? 'bg-accent/5' : 'hover:bg-surface-raised/50'
      } ${deleting ? 'opacity-40' : ''}`}
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

      {/* Branch name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs truncate ${branch.isHead ? 'text-accent font-semibold' : 'text-gray-200'}`}
          >
            {branch.name}
          </span>

          {branch.isHead && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
              HEAD
            </span>
          )}

          {branch.gone && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              gone
            </span>
          )}

          {branch.worktreePath && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
              worktree
            </span>
          )}

          {isMainWorktree && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-raised text-gray-500 border border-surface-border">
              main
            </span>
          )}
        </div>

        {/* Commit subject */}
        <div className="text-[10px] text-gray-600 truncate mt-0.5">
          {branch.lastCommitSubject}
        </div>

        {/* Worktree path */}
        {branch.worktreePath && (
          <div className="text-[10px] text-gray-600 truncate mt-0.5">
            {branch.worktreePath}
          </div>
        )}
      </div>

      {/* Upstream */}
      <div className="w-32 text-[10px] text-gray-500 truncate">
        {branch.upstream || (
          <span className="text-gray-700 italic">no upstream</span>
        )}
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
  )
}
