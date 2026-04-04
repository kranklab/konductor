import { useState, useEffect, useCallback, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import type { Project, Session, ActivityState } from '../types'
import type { GridCols } from '../components/GridView'
import { TERM_THEME } from '../termTheme'

import '@xterm/xterm/css/xterm.css'

const api = window.konductorAPI

function getNextProjectId(projects: Project[]): number {
  let max = 0
  for (const p of projects) {
    const match = p.id.match(/^project-(\d+)$/)
    if (match) {
      max = Math.max(max, parseInt(match[1], 10))
    }
  }
  return max + 1
}

// ─── HMR state persistence ────────────────────────────────────────────

interface SessionMeta {
  id: string
  projectId: string
  cwd: string
  title: string
  summary: string
  claudeSessionId: string
}

interface HmrState {
  projects: Project[]
  activeProjectId: string | null
  sessionMeta: SessionMeta[]
  activeSessionId: string | null
  gridCols?: 1 | 2
}

// Captured once at module load time. Consumed by the first mount of useSessions().
const initialHmrState: HmrState | null = import.meta.hot?.data?.hmrState
  ? (import.meta.hot.data.hmrState as HmrState)
  : null

function isAppShortcut(e: KeyboardEvent): boolean {
  // Alt + Arrow keys — grid navigation
  if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.startsWith('Arrow')) return true
  // Ctrl+Shift+X — toggle focus/grid
  if (e.ctrlKey && e.shiftKey && e.key === 'X') return true
  // Ctrl+Shift+O — new session
  if (e.ctrlKey && e.shiftKey && e.key === 'O') return true
  return false
}

function createTerminal(): Terminal {
  const term = new Terminal({
    theme: TERM_THEME,
    fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true
  })

  // Let app-level shortcuts bypass xterm so they bubble to the window handler
  term.attachCustomKeyEventHandler((e) => {
    if (isAppShortcut(e)) return false
    return true
  })

  return term
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useSessions() {
  const [projects, setProjects] = useState<Project[]>(initialHmrState?.projects ?? [])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    initialHmrState?.activeProjectId ?? null
  )
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialHmrState?.activeSessionId ?? null
  )
  const [gridCols, setGridCols] = useState<GridCols>(initialHmrState?.gridCols ?? 2)
  // `ready` gates BOTH the save-to-disk effect and the PTY listener subscription.
  // It becomes true only after all async initialization (disk load OR HMR restore) completes.
  const [ready, setReady] = useState(false)
  const sessionsRef = useRef<Session[]>([])

  // Keep ref in sync
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  // ─── Cold start: load from disk ─────────────────────────────────────
  useEffect(() => {
    if (initialHmrState) return // HMR path handles its own init

    let cancelled = false
    api.loadState().then(async (state) => {
      if (cancelled) return

      if (state.projects.length > 0) {
        setProjects(state.projects)
      }
      if (state.activeProjectId) {
        setActiveProjectId(state.activeProjectId)
      }
      if (state.gridCols) {
        setGridCols(state.gridCols)
      }

      // Resume persisted sessions
      if (state.sessions.length > 0) {
        const resumed: Session[] = []
        for (const meta of state.sessions) {
          try {
            const sessionProject = state.projects.find((p) => p.id === meta.projectId)
            const { id } = await api.createSession(meta.cwd, {
              claudeSessionId: meta.claudeSessionId,
              name: meta.title,
              resume: true,
              envScript: sessionProject?.envScript
            })
            if (cancelled) return

            const terminal = createTerminal()
            terminal.onData((data) => api.writeToSession(id, data))

            resumed.push({
              id,
              projectId: meta.projectId,
              cwd: meta.cwd,
              title: meta.title,
              summary: meta.summary ?? '',
              terminal,
              alive: true,
              claudeSessionId: meta.claudeSessionId,
              activity: 'ready'
            })
          } catch {
            // Session resume failed — skip it
          }
        }
        if (!cancelled && resumed.length > 0) {
          setSessions(resumed)
          if (state.activeSessionIndex != null && state.activeSessionIndex < resumed.length) {
            setActiveSessionId(resumed[state.activeSessionIndex].id)
          } else {
            setActiveSessionId(resumed[0].id)
          }
        }
      }

      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // ─── HMR: restore sessions from main process ───────────────────────
  useEffect(() => {
    if (!initialHmrState) return // Cold-start path handles its own init

    let cancelled = false

    async function restore(): Promise<void> {
      const alive = await api.listSessions()
      if (cancelled) return

      const aliveIds = new Set(alive.map((s) => s.id))
      const restoredSessions: Session[] = []

      for (const meta of initialHmrState!.sessionMeta) {
        if (!aliveIds.has(meta.id)) continue

        const terminal = createTerminal()
        terminal.onData((data) => api.writeToSession(meta.id, data))

        const scrollback = await api.getScrollback(meta.id)
        if (cancelled) {
          terminal.dispose()
          return
        }
        if (scrollback) {
          terminal.write(scrollback)
        }

        restoredSessions.push({
          id: meta.id,
          projectId: meta.projectId,
          cwd: meta.cwd,
          title: meta.title,
          summary: meta.summary ?? '',
          terminal,
          alive: true,
          claudeSessionId: meta.claudeSessionId,
          activity: 'ready'
        })
      }

      if (!cancelled) {
        setSessions(restoredSessions)
        setReady(true)
      }
    }

    restore()
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Save to disk when state changes (only after ready) ────────────
  useEffect(() => {
    if (!ready) return

    const activeIdx = sessionsRef.current.findIndex((s) => s.id === activeSessionId)

    api.saveState({
      projects,
      activeProjectId,
      nextProjectId: getNextProjectId(projects),
      sessions: sessionsRef.current.map((s) => ({
        projectId: s.projectId,
        cwd: s.cwd,
        title: s.title,
        summary: s.summary,
        claudeSessionId: s.claudeSessionId
      })),
      activeSessionIndex: activeIdx >= 0 ? activeIdx : null,
      gridCols
    })
  }, [projects, activeProjectId, sessions, activeSessionId, gridCols, ready])

  // ─── HMR: save state before module disposal (register once) ────────
  useEffect(() => {
    if (!import.meta.hot) return

    // Store refs that the dispose callback reads at disposal time.
    // This avoids re-registering the callback on every render.
    const stateRef = {
      projects: () => projects,
      activeProjectId: () => activeProjectId,
      activeSessionId: () => activeSessionId,
      sessions: () => sessionsRef.current,
      gridCols: () => gridCols
    }

    // Update the closures each render
    refs.current = stateRef

    // Only register the dispose callback once
    if (!disposeRegistered.current) {
      disposeRegistered.current = true
      import.meta.hot.dispose((data) => {
        const r = refs.current!
        data.hmrState = {
          projects: r.projects(),
          activeProjectId: r.activeProjectId(),
          sessionMeta: r.sessions().map((s) => ({
            id: s.id,
            projectId: s.projectId,
            cwd: s.cwd,
            title: s.title,
            summary: s.summary,
            claudeSessionId: s.claudeSessionId
          })),
          activeSessionId: r.activeSessionId(),
          gridCols: r.gridCols()
        } satisfies HmrState

        for (const s of r.sessions()) {
          s.terminal.dispose()
        }
      })
    }
  })

  // Subscribe to PTY output (only after ready)
  useEffect(() => {
    if (!ready) return

    const unsubOutput = api.onPtyOutput((sessionId, data) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId)
      if (session) {
        session.terminal.write(data)
      }
    })

    const unsubExit = api.onPtyExit((sessionId) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId)
      if (session) {
        session.terminal.dispose()
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setActiveSessionId((prev) => {
        if (prev === sessionId) {
          const remaining = sessionsRef.current.filter((s) => s.id !== sessionId)
          return remaining.length > 0 ? remaining[0].id : null
        }
        return prev
      })
    })

    const unsubActivity = api.onSessionActivity(
      (claudeSessionId: string, state: ActivityState, _tool: string, summary: string) => {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.claudeSessionId !== claudeSessionId) return s
            const updates: Partial<Session> = { activity: state }
            // Only auto-set summary if the session doesn't already have one
            // (preserves manual edits and avoids overwriting with later responses)
            if (summary && !s.summary) updates.summary = summary
            return { ...s, ...updates }
          })
        )
      }
    )

    return () => {
      unsubOutput()
      unsubExit()
      unsubActivity()
    }
  }, [ready])

  const createProject = useCallback(async () => {
    const dir = await api.selectDirectory()
    if (!dir) return null

    // Auto-discover env scripts from the project's .konductor/ directory
    const envScripts = await api.listEnvScripts(dir)
    const envScript = envScripts.length > 0 ? envScripts[0] : undefined

    let project: Project | null = null
    setProjects((prev) => {
      const id = `project-${getNextProjectId(prev)}`
      const name = dir.split('/').pop() || dir
      project = { id, name, cwd: dir, envScript }
      return [...prev, project]
    })
    if (!project) return null

    setActiveProjectId((project as Project).id)
    return project as Project
  }, [])

  const updateProject = useCallback((projectId: string, updates: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...updates } : p)))
  }, [])

  const removeProject = useCallback((projectId: string) => {
    const projectSessions = sessionsRef.current.filter((s) => s.projectId === projectId)
    for (const session of projectSessions) {
      api.killSession(session.id)
      session.terminal.dispose()
    }
    setSessions((prev) => prev.filter((s) => s.projectId !== projectId))
    setProjects((prev) => prev.filter((p) => p.id !== projectId))
    setActiveProjectId((prev) => {
      if (prev === projectId) return null
      return prev
    })
    setActiveSessionId((prev) => {
      if (prev && projectSessions.some((s) => s.id === prev)) return null
      return prev
    })
  }, [])

  const createSession = useCallback(
    async (projectId: string, cwd: string, branch?: string, prompt?: string) => {
      const sessionCount = sessionsRef.current.filter((s) => s.projectId === projectId).length
      const title = branch ? `${branch}` : `Session ${sessionCount + 1}`
      const project = projects.find((p) => p.id === projectId)

      const { id, claudeSessionId } = await api.createSession(cwd, {
        name: title,
        prompt,
        envScript: project?.envScript
      })

      const terminal = createTerminal()
      terminal.onData((data) => {
        api.writeToSession(id, data)
      })

      const session: Session = {
        id,
        projectId,
        cwd,
        title,
        summary: '',
        terminal,
        alive: true,
        claudeSessionId,
        activity: 'ready'
      }

      setSessions((prev) => [...prev, session])
      setActiveSessionId(id)
      setActiveProjectId(projectId)
      return id
    },
    [projects]
  )

  const killSession = useCallback((sessionId: string) => {
    const session = sessionsRef.current.find((s) => s.id === sessionId)
    if (session) {
      api.killSession(sessionId)
      session.terminal.dispose()
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setActiveSessionId((prev) => {
        if (prev === sessionId) {
          const remaining = sessionsRef.current.filter((s) => s.id !== sessionId)
          return remaining.length > 0 ? remaining[0].id : null
        }
        return prev
      })
    }
  }, [])

  const updateSessionSummary = useCallback((sessionId: string, summary: string) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, summary } : s)))
  }, [])

  const resizeSession = useCallback((sessionId: string, cols: number, rows: number) => {
    api.resizeSession(sessionId, cols, rows)
  }, [])

  const activeProject = projects.find((p) => p.id === activeProjectId) || null
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null
  const projectSessions = activeProjectId
    ? sessions.filter((s) => s.projectId === activeProjectId)
    : []

  return {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    createProject,
    updateProject,
    removeProject,
    sessions: projectSessions,
    allSessions: sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    killSession,
    resizeSession,
    updateSessionSummary,
    gridCols,
    setGridCols
  }
}

// ─── HMR dispose indirection ──────────────────────────────────────────
// Refs used by the dispose callback so it always reads current state
// without needing to re-register the callback on every render.
interface HmrRefs {
  projects: () => Project[]
  activeProjectId: () => string | null
  activeSessionId: () => string | null
  sessions: () => Session[]
  gridCols: () => 1 | 2
}
const refs = { current: null as null | HmrRefs }
const disposeRegistered = { current: false }
