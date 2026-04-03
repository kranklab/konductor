import { useState, useCallback, useEffect, useRef } from 'react'
import type { ViewMode, Session } from './types'
import { useSessions } from './hooks/useSessions'
import { useFileChanges } from './hooks/useFileChanges'
import Sidebar from './components/Sidebar'
import GridView from './components/GridView'
import FocusView from './components/FocusView'
import ChangesView from './components/ChangesView'
import WorktreeModal from './components/WorktreeModal'
import BranchesView from './components/BranchesView'

const savedViewMode = import.meta.hot?.data?.viewMode as ViewMode | undefined

function App(): React.JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>(savedViewMode ?? 'grid')

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
    removeProject,
    sessions,
    allSessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    killSession,
    resizeSession
  } = useSessions()

  // Worktree modal state: stores projectId when modal is open
  const [worktreeProjectId, setWorktreeProjectId] = useState<string | null>(null)
  const worktreeProject = worktreeProjectId
    ? projects.find((p) => p.id === worktreeProjectId) ?? null
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
      setViewMode('focus')
    },
    [worktreeProjectId, createSession]
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
          if (effectiveViewMode === 'grid') setViewMode('focus')
        }}
        onSetView={setViewMode}
        onNewProject={handleNewProject}
        onNewSession={handleNewSessionInProject}
        onRemoveProject={removeProject}
        onShowBranches={handleShowBranches}
      />

      <main className="flex-1 min-w-0">
        {effectiveViewMode === 'grid' && (
          <GridView
            project={activeProject}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onFocusSession={handleFocusSession}
            onCloseSession={handleCloseSession}
            onResizeSession={handleResizeSession}
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
