import { useState, useCallback, useEffect } from 'react'
import type { ViewMode } from './types'
import { useSessions } from './hooks/useSessions'
import { useFileChanges } from './hooks/useFileChanges'
import Sidebar from './components/Sidebar'
import GridView from './components/GridView'
import FocusView from './components/FocusView'
import ChangesView from './components/ChangesView'

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

  const changes = useFileChanges(activeSessionId)

  // Fall back to grid when active session disappears (e.g. shell exited)
  const effectiveViewMode =
    (viewMode === 'focus' || viewMode === 'changes') && !activeSession ? 'grid' : viewMode

  const handleNewProject = useCallback(async () => {
    const project = await createProject()
    if (project) {
      // Automatically create first session in new project
      await createSession(project.id, project.cwd)
      setViewMode('focus')
    }
  }, [createProject, createSession])

  const handleNewSession = useCallback(async () => {
    if (!activeProject) return
    await createSession(activeProject.id, activeProject.cwd)
    setViewMode('focus')
  }, [activeProject, createSession])

  const handleNewSessionInProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project) return
      await createSession(projectId, project.cwd)
      setViewMode('focus')
    },
    [createSession, projects]
  )

  const handleFocusSession = useCallback(
    (id: string) => {
      setActiveSessionId(id)
      setViewMode('focus')
    },
    [setActiveSessionId]
  )

  const handleCloseSession = useCallback(
    (id: string) => {
      killSession(id)
      if (sessions.length <= 1) {
        setViewMode('grid')
      }
    },
    [killSession, sessions.length]
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
      />

      <main className="flex-1 min-w-0">
        {effectiveViewMode === 'grid' && (
          <GridView
            project={activeProject}
            sessions={sessions}
            activeSessionId={activeSessionId}
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
      </main>
    </div>
  )
}

export default App
