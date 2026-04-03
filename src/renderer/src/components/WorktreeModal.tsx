import { useState, useEffect, useCallback } from 'react'

const api = window.konductorAPI

const ADJECTIVES = [
  'swift',
  'bright',
  'calm',
  'bold',
  'keen',
  'vivid',
  'warm',
  'crisp',
  'fresh',
  'noble',
  'quiet',
  'rapid',
  'sharp',
  'sleek',
  'smooth',
  'steady',
  'witty',
  'agile',
  'clever',
  'cosmic',
  'daring',
  'eager',
  'fierce',
  'gentle',
  'golden',
  'lucid',
  'mystic',
  'nimble',
  'plucky',
  'rustic'
]

const NOUNS = [
  'fox',
  'owl',
  'elm',
  'oak',
  'jay',
  'wren',
  'pike',
  'lynx',
  'reef',
  'fern',
  'hawk',
  'cove',
  'dale',
  'glen',
  'mesa',
  'puma',
  'sage',
  'tide',
  'vale',
  'wolf',
  'bear',
  'crow',
  'dove',
  'hare',
  'lark',
  'moth',
  'orca',
  'rook',
  'stag',
  'yak'
]

function randomBranchName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj}-${noun}`
}

interface WorktreeOption {
  path: string
  branch: string
  isMain: boolean
}

interface WorktreeModalProps {
  projectCwd: string
  onSelect: (cwd: string, branch: string) => void
  onCancel: () => void
}

export default function WorktreeModal({
  projectCwd,
  onSelect,
  onCancel
}: WorktreeModalProps): React.JSX.Element {
  const [worktrees, setWorktrees] = useState<WorktreeOption[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [newBranch, setNewBranch] = useState('')
  const [baseBranch, setBaseBranch] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updateFromOrigin, setUpdateFromOrigin] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const [wt, br] = await Promise.all([
          api.listWorktrees(projectCwd),
          api.listBranches(projectCwd)
        ])
        if (cancelled) return
        setWorktrees(wt)
        setBranches(br)

        // Default base branch to the main worktree's branch
        const main = wt.find((w) => w.isMain)
        if (main) setBaseBranch(main.branch)
      } catch {
        if (!cancelled) setError('Not a git repository')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectCwd])

  const handleCreate = useCallback(
    async (branchName?: string) => {
      const name = (branchName ?? newBranch).trim()
      if (!name) return
      setCreating(true)
      setError(null)
      try {
        const wt = await api.createWorktree(projectCwd, name, true, updateFromOrigin)
        onSelect(wt.path, wt.branch)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create worktree')
        setCreating(false)
      }
    },
    [projectCwd, newBranch, updateFromOrigin, onSelect]
  )

  const handleQuickCreate = useCallback(() => {
    handleCreate(randomBranchName())
  }, [handleCreate])

  const handleCheckoutExisting = useCallback(
    async (branch: string) => {
      setCreating(true)
      setError(null)
      try {
        const wt = await api.createWorktree(projectCwd, branch, false, updateFromOrigin)
        onSelect(wt.path, wt.branch)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create worktree')
        setCreating(false)
      }
    },
    [projectCwd, updateFromOrigin, onSelect]
  )

  // Branches that already have worktrees
  const worktreeBranches = new Set(worktrees.map((w) => w.branch))
  // Branches available for checkout (no worktree yet)
  const availableBranches = branches.filter((b) => !worktreeBranches.has(b))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-overlay border border-surface-border rounded-lg w-[420px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-gray-200">Choose Worktree</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-sm">
            Esc
          </button>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="mx-4 mt-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Quick create */}
            <div className="px-4 pt-4 pb-2">
              <button
                onClick={handleQuickCreate}
                disabled={creating}
                className="w-full py-2.5 rounded bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M1 10h3l2.5-4L9 10h2.5M1 6h2l1.5 2M11.5 6H10L9 7.5" />
                  <path d="M12.5 4.5l2 1.5-2 1.5M12.5 8.5l2 1.5-2 1.5" />
                </svg>
                {creating ? 'Creating...' : 'Quick Start'}
              </button>
              <p className="text-[10px] text-gray-600 mt-1.5 text-center">
                New worktree with a random branch name
              </p>
            </div>

            {/* Update from origin toggle */}
            <div className="px-4 pb-3">
              <label className="flex items-center gap-2 cursor-pointer group">
                <button
                  type="button"
                  role="switch"
                  aria-checked={updateFromOrigin}
                  onClick={() => setUpdateFromOrigin((v) => !v)}
                  className={`relative w-7 h-4 rounded-full transition-colors ${
                    updateFromOrigin
                      ? 'bg-accent'
                      : 'bg-surface-raised border border-surface-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      updateFromOrigin ? 'translate-x-3' : ''
                    }`}
                  />
                </button>
                <span className="text-[10px] text-gray-500 group-hover:text-gray-400 transition-colors">
                  Update from origin{baseBranch ? ` (${baseBranch})` : ''}
                </span>
              </label>
            </div>

            {/* Existing worktrees */}
            <div className="px-4 pb-4 pt-1 border-t border-surface-border">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                Worktrees
              </div>
              <div className="space-y-1">
                {worktrees.map((wt) => (
                  <button
                    key={wt.path}
                    onClick={() => onSelect(wt.path, wt.branch)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded text-left hover:bg-surface-raised transition-colors group"
                  >
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${wt.isMain ? 'bg-accent' : 'bg-green-400'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 truncate">{wt.branch}</div>
                      <div className="text-[10px] text-gray-600 truncate">{wt.path}</div>
                    </div>
                    {wt.isMain && <span className="text-[10px] text-gray-600 shrink-0">main</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabs for new worktree */}
            <div className="px-4 pb-4">
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setMode('create')}
                  className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-colors ${
                    mode === 'create'
                      ? 'bg-accent/20 text-accent'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  New Branch
                </button>
                {availableBranches.length > 0 && (
                  <button
                    onClick={() => setMode('list')}
                    className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-colors ${
                      mode === 'list'
                        ? 'bg-accent/20 text-accent'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Existing Branch ({availableBranches.length})
                  </button>
                )}
              </div>

              {mode === 'create' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newBranch}
                      onChange={(e) => setNewBranch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate()
                      }}
                      placeholder="feature/my-branch"
                      autoFocus
                      className="flex-1 bg-surface border border-surface-border rounded px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => setNewBranch(randomBranchName())}
                      className="px-2.5 py-2 rounded bg-surface border border-surface-border text-gray-500 hover:text-accent hover:border-accent/50 transition-colors"
                      title="Random name"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M1 10h3l2.5-4L9 10h2.5M1 6h2l1.5 2M11.5 6H10L9 7.5" />
                        <path d="M12.5 4.5l2 1.5-2 1.5M12.5 8.5l2 1.5-2 1.5" />
                      </svg>
                    </button>
                  </div>
                  {baseBranch && (
                    <div className="text-[10px] text-gray-600">
                      branching from <span className="text-gray-400">{baseBranch}</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleCreate()}
                    disabled={!newBranch.trim() || creating}
                    className="w-full py-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                  >
                    {creating ? 'Creating...' : 'Create Worktree'}
                  </button>
                </div>
              )}

              {mode === 'list' && availableBranches.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {availableBranches.map((branch) => (
                    <button
                      key={branch}
                      onClick={() => handleCheckoutExisting(branch)}
                      disabled={creating}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded text-left hover:bg-surface-raised transition-colors disabled:opacity-40"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-gray-500 shrink-0"
                      >
                        <path d="M5 3v6.5a2.5 2.5 0 005 0V8" />
                        <circle cx="5" cy="2" r="1.5" />
                        <circle cx="10" cy="7" r="1.5" />
                      </svg>
                      <span className="text-xs text-gray-300 truncate">{branch}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
