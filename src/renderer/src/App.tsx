import { useState, useCallback, useEffect, useRef } from 'react'
import type { ViewMode, Session } from './types'
import { useSessions } from './hooks/useSessions'
import { useFileChanges } from './hooks/useFileChanges'
import Sidebar from './components/Sidebar'
import GridView, { type GridCols } from './components/GridView'
import FocusView from './components/FocusView'
import ChangesView from './components/ChangesView'
import WorktreeModal from './components/WorktreeModal'
import BranchesView from './components/BranchesView'
import GitHubView from './components/GitHubView'

const savedViewMode = import.meta.hot?.data?.viewMode as ViewMode | undefined

function App(): React.JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>(savedViewMode ?? 'grid')
  const [gridCols, setGridCols] = useState<GridCols>(2)

  useEffect(() => {
    if (!import.meta.hot) return
    import.meta.hot.dispose((data) => {
      data.viewMode = viewMode
    })
  })
  const {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    createProject,
    updateProject,
    removeProject,
    sessions,
    allSessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    killSession,
    resizeSession,
    updateSessionSummary
  } = useSessions()

  // Worktree modal state: stores projectId when modal is open
  const [worktreeProjectId, setWorktreeProjectId] = useState<string | null>(null)
  const worktreeProject = worktreeProjectId
    ? (projects.find((p) => p.id === worktreeProjectId) ?? null)
    : null

  // Close-worktree confirmation state
  const [closingSession, setClosingSession] = useState<Session | null>(null)
  const closingProjectCwd = useRef<string | null>(null)

  const changes = useFileChanges(activeSessionId)

  // Fall back to grid when active session disappears (e.g. shell exited)
  const effectiveViewMode =
    (viewMode === 'focus' || viewMode === 'changes') && !activeSession ? 'grid' : viewMode

  const handleShowBranches = useCallback(() => {
    setViewMode('branches')
  }, [])

  const handleShowGitHub = useCallback(() => {
    setViewMode('github')
  }, [])

  const handleOpenBranchSession = useCallback(
    async (branch: string, isNew: boolean, prompt?: string) => {
      if (!activeProject || !activeProjectId) return

      // 1. Check if a session already exists on this branch (by matching title)
      const existing = allSessions.find(
        (s) => s.projectId === activeProjectId && s.title === branch
      )
      if (existing) {
        setActiveSessionId(existing.id)
        setViewMode('focus')
        return
      }

      // 2. Check if a worktree already exists for this branch
      try {
        const worktrees = await window.konductorAPI.listWorktrees(activeProject.cwd)
        const wt = worktrees.find((w) => w.branch === branch)
        if (wt) {
          await createSession(activeProjectId, wt.path, branch, prompt)
          setViewMode('focus')
          return
        }
      } catch {
        // ignore worktree listing errors
      }

      // 3. Create a new worktree and session
      try {
        const wt = await window.konductorAPI.createWorktree(activeProject.cwd, branch, isNew)
        await createSession(activeProjectId, wt.path, branch, prompt)
        setViewMode('focus')
      } catch (e) {
        console.error('Failed to create worktree session:', e)
      }
    },
    [activeProject, activeProjectId, allSessions, createSession, setActiveSessionId]
  )

  const handleNewProject = useCallback(async () => {
    const project = await createProject()
    if (project) {
      setWorktreeProjectId(project.id)
    }
  }, [createProject])

  const handleNewSession = useCallback(() => {
    if (!activeProject) return
    setWorktreeProjectId(activeProject.id)
  }, [activeProject])

  const handleNewSessionInProject = useCallback((projectId: string) => {
    setWorktreeProjectId(projectId)
  }, [])

  const handleWorktreeSelect = useCallback(
    async (cwd: string, branch: string) => {
      if (!worktreeProjectId) return
      setWorktreeProjectId(null)
      await createSession(worktreeProjectId, cwd, branch)
      if (viewMode !== 'grid') {
        setViewMode('focus')
      }
    },
    [worktreeProjectId, createSession, viewMode]
  )

  const handleFocusSession = useCallback(
    (id: string) => {
      setActiveSessionId(id)
      setViewMode('focus')
    },
    [setActiveSessionId]
  )

  const doCloseSession = useCallback(
    (id: string) => {
      killSession(id)
      if (sessions.length <= 1) {
        setViewMode('grid')
      }
    },
    [killSession, sessions.length]
  )

  const handleCloseSession = useCallback(
    (id: string) => {
      const session = allSessions.find((s) => s.id === id)
      if (!session) return

      const project = projects.find((p) => p.id === session.projectId)
      if (project && session.cwd !== project.cwd) {
        // Worktree session — ask the user
        closingProjectCwd.current = project.cwd
        setClosingSession(session)
        return
      }

      doCloseSession(id)
    },
    [allSessions, projects, doCloseSession]
  )

  const handleConfirmClose = useCallback(
    async (deleteWorktree: boolean) => {
      if (!closingSession) return
      const sessionId = closingSession.id
      const sessionCwd = closingSession.cwd
      const repoRoot = closingProjectCwd.current

      setClosingSession(null)
      closingProjectCwd.current = null

      doCloseSession(sessionId)

      if (deleteWorktree && repoRoot) {
        try {
          await window.konductorAPI.removeWorktree(repoRoot, sessionCwd)
          const branch = sessionCwd.split('/').pop()
          if (branch) {
            await window.konductorAPI.deleteBranch(repoRoot, branch, true)
          }
        } catch (e) {
          console.error('Failed to remove worktree:', e)
        }
      }
    },
    [closingSession, doCloseSession]
  )

  const handleResizeSession = useCallback(
    (id: string, cols: number, rows: number) => {
      resizeSession(id, cols, rows)
    },
    [resizeSession]
  )

  // ─── Keyboard shortcuts ──────────────────────────────────────────────
  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)
  const effectiveViewModeRef = useRef(effectiveViewMode)
  const gridColsRef = useRef(gridCols)
  useEffect(() => {
    sessionsRef.current = sessions
    activeSessionIdRef.current = activeSessionId
    effectiveViewModeRef.current = effectiveViewMode
    gridColsRef.current = gridCols
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Alt + Arrow keys — spatial grid navigation
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.startsWith('Arrow')) {
        const s = sessionsRef.current
        if (s.length < 2) return
        const idx = s.findIndex((x) => x.id === activeSessionIdRef.current)
        if (idx < 0) return

        const c = gridColsRef.current
        const row = Math.floor(idx / c)
        const col = idx % c
        const totalRows = Math.ceil(s.length / c)
        let next = -1

        if (e.key === 'ArrowRight' && c > 1) {
          const target = row * c + col + 1
          if (col + 1 < c && target < s.length) next = target
        } else if (e.key === 'ArrowLeft' && c > 1) {
          if (col > 0) next = row * c + col - 1
        } else if (e.key === 'ArrowDown') {
          const target = (row + 1) * c + col
          if (row + 1 < totalRows && target < s.length) next = target
        } else if (e.key === 'ArrowUp') {
          if (row > 0) next = (row - 1) * c + col
        }

        if (next >= 0) {
          setActiveSessionId(s[next].id)
          // Focus the terminal so keystrokes go to it even in grid view
          requestAnimationFrame(() => s[next].terminal.focus())
          e.preventDefault()
        }
        return
      }

      // Ctrl+Shift+X — toggle focus/grid
      if (e.ctrlKey && e.shiftKey && e.key === 'X') {
        if (effectiveViewModeRef.current === 'focus') {
          setViewMode('grid')
        } else if (activeSessionIdRef.current) {
          setViewMode('focus')
        }
        e.preventDefault()
        return
      }

      // Ctrl+Shift+O — new session
      if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        handleNewSession()
        e.preventDefault()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveSessionId, handleNewSession])

  return (
    <div className="h-screen w-screen flex bg-surface">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        sessions={sessions}
        allSessions={allSessions}
        activeSessionId={activeSessionId}
        viewMode={effectiveViewMode}
        onSelectProject={(id) => {
          setActiveProjectId(id)
          setViewMode('grid')
        }}
        onSelectSession={(id) => {
          setActiveSessionId(id)
          if (effectiveViewMode !== 'focus') setViewMode('focus')
        }}
        onSetView={setViewMode}
        onNewProject={handleNewProject}
        onNewSession={handleNewSessionInProject}
        onRemoveProject={removeProject}
        onUpdateProject={updateProject}
        onShowBranches={handleShowBranches}
        onShowGitHub={handleShowGitHub}
      />

      <main className="flex-1 min-w-0">
        {effectiveViewMode === 'grid' && (
          <GridView
            project={activeProject}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            gridCols={gridCols}
            onSetGridCols={setGridCols}
            onFocusSession={handleFocusSession}
            onCloseSession={handleCloseSession}
            onResizeSession={handleResizeSession}
            onUpdateSummary={updateSessionSummary}
            onNewSession={handleNewSession}
            onNewProject={handleNewProject}
          />
        )}

        {effectiveViewMode === 'focus' && activeSession && (
          <FocusView
            session={activeSession}
            onBack={() => setViewMode('grid')}
            onShowChanges={() => setViewMode('changes')}
            onClose={() => handleCloseSession(activeSession.id)}
            onResize={(cols, rows) => handleResizeSession(activeSession.id, cols, rows)}
            onUpdateSummary={(summary) => updateSessionSummary(activeSession.id, summary)}
          />
        )}

        {effectiveViewMode === 'changes' && activeSession && (
          <ChangesView
            session={activeSession}
            changes={changes}
            onBack={() => setViewMode('focus')}
            onResize={(cols, rows) => handleResizeSession(activeSession.id, cols, rows)}
          />
        )}

        {effectiveViewMode === 'branches' && activeProject && (
          <BranchesView project={activeProject} onBack={() => setViewMode('grid')} />
        )}

        {effectiveViewMode === 'github' && activeProject && (
          <GitHubView
            project={activeProject}
            onBack={() => setViewMode('grid')}
            onOpenSession={handleOpenBranchSession}
          />
        )}
      </main>

      {worktreeProject && (
        <WorktreeModal
          projectCwd={worktreeProject.cwd}
          onSelect={handleWorktreeSelect}
          onCancel={() => setWorktreeProjectId(null)}
        />
      )}

      {closingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-overlay border border-surface-border rounded-lg w-[360px] shadow-2xl">
            <div className="px-4 py-3 border-b border-surface-border">
              <h2 className="text-sm font-semibold text-gray-200">Close Worktree Session</h2>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-gray-400 mb-1">
                <span className="text-gray-200">{closingSession.title}</span>
              </p>
              <p className="text-[10px] text-gray-600 mb-4 truncate">{closingSession.cwd}</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleConfirmClose(false)}
                  className="w-full py-2 rounded bg-surface-raised border border-surface-border text-gray-300 hover:text-white hover:border-gray-500 text-xs font-medium transition-colors"
                >
                  Close Session
                </button>
                <button
                  onClick={() => handleConfirmClose(true)}
                  className="w-full py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 text-xs font-medium transition-colors"
                >
                  Close & Delete Worktree
                </button>
                <button
                  onClick={() => setClosingSession(null)}
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

export default App
