import { useState, useEffect, useRef } from 'react'
import type { UpdateStatus } from '../../../preload/index'
import type { Project, Session, ViewMode } from '../types'
import logoSvg from '../assets/logo.svg'

function Kbd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-400 font-mono">
      {children}
    </kbd>
  )
}

interface SidebarProps {
  projects: Project[]
  activeProjectId: string | null
  sessions: Session[]
  allSessions: Session[]
  activeSessionId: string | null
  viewMode: ViewMode
  onSelectProject: (id: string) => void
  onSelectSession: (id: string) => void
  onSetView: (mode: ViewMode) => void
  onNewProject: () => void
  onNewSession: (projectId: string) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, updates: Partial<Project>) => void
  onShowBranches: () => void
  onShowGitHub: () => void
  onShowSettings: () => void
}

export default function Sidebar({
  projects,
  activeProjectId,
  allSessions,
  activeSessionId,
  viewMode,
  onSelectProject,
  onSelectSession,
  onSetView,
  onNewProject,
  onNewSession,
  onRemoveProject,
  onUpdateProject,
  onShowBranches,
  onShowGitHub,
  onShowSettings
}: SidebarProps): React.JSX.Element {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (activeProjectId) initial.add(activeProjectId)
    return initial
  })

  // Auto-expand when active project changes (e.g. new project created).
  // This uses the React-recommended "adjust state during render" pattern
  // to avoid both useEffect-setState and ref-during-render lint violations.
  const [prevActiveProjectId, setPrevActiveProjectId] = useState(activeProjectId)
  if (activeProjectId && activeProjectId !== prevActiveProjectId) {
    setPrevActiveProjectId(activeProjectId)
    if (!expandedIds.has(activeProjectId)) {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        next.add(activeProjectId)
        return next
      })
    }
  }

  const toggleExpanded = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="w-52 shrink-0 bg-surface-overlay border-r border-surface-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-surface-border">
        <div className="flex items-center gap-1.5 select-none">
          <img src={logoSvg} alt="" className="w-5 h-5" />
          <span className="text-accent font-bold text-sm tracking-wide">Konductor</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSetView('grid')}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              viewMode === 'grid'
                ? 'bg-accent/20 text-accent'
                : 'text-gray-500 hover:text-gray-300 hover:bg-surface-raised'
            }`}
            title="Grid view"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="1" y="1" width="5.5" height="5.5" rx="1" />
              <rect x="9.5" y="1" width="5.5" height="5.5" rx="1" />
              <rect x="1" y="9.5" width="5.5" height="5.5" rx="1" />
              <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (activeSessionId) onSetView('focus')
            }}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              viewMode === 'focus'
                ? 'bg-accent/20 text-accent'
                : 'text-gray-500 hover:text-gray-300 hover:bg-surface-raised'
            } ${!activeSessionId ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Focus view"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="1" y="1" width="14" height="14" rx="2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-2">
        {projects.map((project) => {
          const projectSessions = allSessions.filter((s) => s.projectId === project.id)
          const isActive = project.id === activeProjectId
          const isExpanded = expandedIds.has(project.id)

          return (
            <div key={project.id} className="mb-1">
              {/* Project header */}
              <button
                onClick={() => {
                  onSelectProject(project.id)
                  toggleExpanded(project.id)
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left group transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface-raised'
                }`}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="currentColor"
                  className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''} ${isActive ? 'text-accent' : 'text-gray-500'}`}
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className={`shrink-0 ${isActive ? 'text-accent' : 'text-gray-500'}`}
                >
                  <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
                </svg>
                <span className="text-xs font-medium truncate flex-1">{project.name}</span>
                <span className="text-[10px] text-gray-600 shrink-0">{projectSessions.length}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveProject(project.id)
                  }}
                  className="text-gray-600 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Remove project"
                >
                  x
                </button>
              </button>

              {/* Expanded project contents */}
              {isExpanded && (
                <div className="ml-4 border-l border-surface-border">
                  {/* Sessions section */}
                  <div className="flex items-center pl-3 pr-3 pt-2 pb-1">
                    <span className="text-[10px] uppercase tracking-wider text-gray-600 flex-1">
                      Sessions
                    </span>
                    <span className="text-[10px] text-gray-600">{projectSessions.length}</span>
                  </div>

                  {projectSessions.map((session) => {
                    const isWorktree = session.cwd !== project.cwd
                    return (
                      <button
                        key={session.id}
                        onClick={() => onSelectSession(session.id)}
                        className={`w-full flex items-start gap-2 pl-3 pr-3 py-1 text-left transition-colors ${
                          session.id === activeSessionId
                            ? 'text-white bg-accent/10'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-surface-raised'
                        }`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                            session.dormant
                              ? 'bg-gray-500'
                              : !session.alive
                                ? 'bg-red-400'
                                : session.activity === 'working'
                                  ? 'bg-green-400 animate-pulse'
                                  : session.activity === 'waiting'
                                    ? 'bg-amber-400'
                                    : 'bg-green-400'
                          }`}
                          title={
                            session.dormant
                              ? 'Paused — click to resume'
                              : !session.alive
                                ? 'Exited'
                                : session.activity === 'working'
                                  ? 'Working...'
                                  : session.activity === 'waiting'
                                    ? 'Awaiting input'
                                    : 'Ready'
                          }
                        />
                        {isWorktree && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="shrink-0 mt-0.5 text-gray-500"
                          >
                            <path d="M5 3v6.5a2.5 2.5 0 005 0V8" />
                            <circle cx="5" cy="2" r="1.5" />
                            <circle cx="10" cy="7" r="1.5" />
                          </svg>
                        )}
                        <div className="min-w-0">
                          <span className="text-xs truncate block">{session.title}</span>
                          {isWorktree && (
                            <span className="text-[9px] text-gray-600 truncate block">
                              {session.cwd.split('/').slice(-3).join('/')}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}

                  <button
                    onClick={() => onNewSession(project.id)}
                    className="w-full flex items-center gap-2 pl-3 pr-3 py-1 text-left text-gray-600 hover:text-accent transition-colors"
                  >
                    <span className="text-xs">+ session</span>
                  </button>

                  {/* Env script */}
                  <EnvScriptSection project={project} onUpdateProject={onUpdateProject} />

                  {/* Branches & Worktrees section */}
                  <button
                    onClick={() => {
                      onSelectProject(project.id)
                      onShowBranches()
                    }}
                    className={`w-full flex items-center gap-2 pl-3 pr-3 pt-2 pb-1.5 text-left transition-colors ${
                      isActive && viewMode === 'branches'
                        ? 'text-accent'
                        : 'text-gray-600 hover:text-gray-300'
                    }`}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="shrink-0"
                    >
                      <path d="M5 3v6.5a2.5 2.5 0 005 0V8" />
                      <circle cx="5" cy="2" r="1.5" />
                      <circle cx="10" cy="7" r="1.5" />
                    </svg>
                    <span className="text-[10px] uppercase tracking-wider flex-1">Branches</span>
                  </button>

                  {/* GitHub section */}
                  <button
                    onClick={() => {
                      onSelectProject(project.id)
                      onShowGitHub()
                    }}
                    className={`w-full flex items-center gap-2 pl-3 pr-3 pt-1 pb-1.5 text-left transition-colors ${
                      isActive && viewMode === 'github'
                        ? 'text-accent'
                        : 'text-gray-600 hover:text-gray-300'
                    }`}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="shrink-0"
                    >
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    <span className="text-[10px] uppercase tracking-wider flex-1">GitHub</span>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-surface-border px-3 py-2 space-y-1.5">
        <button
          onClick={onNewProject}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs text-gray-500 hover:text-accent hover:bg-surface-raised transition-colors"
          title="New project"
        >
          <span>+</span>
          <span>New Project</span>
        </button>
        <div className="flex items-center justify-center gap-1">
          <ShortcutHelp />
          <button
            onClick={onShowSettings}
            className={`flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
              viewMode === 'settings'
                ? 'text-accent'
                : 'text-gray-600 hover:text-gray-400 hover:bg-surface-raised'
            }`}
            title="Settings"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="shrink-0"
            >
              <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z" />
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.377l-.16-.292c-.415-.764.421-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z" />
            </svg>
          </button>
        </div>
        <VersionIndicator />
      </div>
    </div>
  )
}

function EnvScriptSection({
  project,
  onUpdateProject
}: {
  project: Project
  onUpdateProject: (id: string, updates: Partial<Project>) => void
}): React.JSX.Element {
  const [discovered, setDiscovered] = useState<string[]>([])

  useEffect(() => {
    window.konductorAPI.listEnvScripts(project.cwd).then(setDiscovered)
  }, [project.cwd])

  const selectedName = project.envScript?.split('/').pop()

  return (
    <>
      <div className="flex items-center pl-3 pr-3 pt-2 pb-1">
        <span className="text-[10px] uppercase tracking-wider text-gray-600 flex-1">
          Env Script
        </span>
      </div>
      {discovered.length > 0 ? (
        discovered.map((scriptPath) => {
          const name = scriptPath.split('/').pop()!
          const isSelected = project.envScript === scriptPath
          return (
            <div key={scriptPath} className="flex items-center gap-1 pl-3 pr-3 py-1 group">
              <button
                onClick={() =>
                  onUpdateProject(project.id, {
                    envScript: isSelected ? undefined : scriptPath
                  })
                }
                className={`text-[10px] truncate flex-1 text-left ${
                  isSelected ? 'text-accent' : 'text-gray-500 hover:text-gray-300'
                }`}
                title={isSelected ? `${scriptPath} (active — click to deselect)` : scriptPath}
              >
                {isSelected ? `● ${name}` : `○ ${name}`}
              </button>
            </div>
          )
        })
      ) : project.envScript ? (
        <div className="flex items-center gap-1 pl-3 pr-3 py-1 group">
          <span className="text-[10px] text-gray-400 truncate flex-1" title={project.envScript}>
            {selectedName}
          </span>
          <button
            onClick={() => onUpdateProject(project.id, { envScript: undefined })}
            className="text-gray-600 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            title="Remove env script"
          >
            x
          </button>
        </div>
      ) : null}
      <button
        onClick={async () => {
          const path = await window.konductorAPI.selectFile('Select env script')
          if (path) onUpdateProject(project.id, { envScript: path })
        }}
        className="w-full flex items-center gap-2 pl-3 pr-3 py-1 text-left text-gray-600 hover:text-accent transition-colors"
      >
        <span className="text-xs">+ set script</span>
      </button>
    </>
  )
}

function VersionIndicator(): React.JSX.Element {
  const [update, setUpdate] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    return window.konductorAPI.onUpdateStatus((info) => setUpdate(info))
  }, [])

  if (update) {
    if (update.status === 'error') {
      return (
        <div
          className="w-full flex items-center justify-center gap-1.5 py-1 text-[10px] text-red-400"
          title={update.message}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span>Update error</span>
        </div>
      )
    }

    const isReady = update.status === 'ready'
    return (
      <button
        onClick={isReady ? () => window.konductorAPI.installUpdate() : undefined}
        className={`w-full flex items-center justify-center gap-1.5 py-1 rounded text-[10px] transition-colors ${
          isReady
            ? 'text-accent hover:bg-accent/10 cursor-pointer'
            : 'text-yellow-400 cursor-default'
        }`}
        title={
          isReady
            ? `Click to restart and update to ${update.version}`
            : `Downloading ${update.version}…`
        }
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-accent' : 'bg-yellow-400 animate-pulse'}`}
        />
        <span>{isReady ? `Update to ${update.version}` : `Updating…`}</span>
      </button>
    )
  }

  return <div className="text-[10px] text-gray-600 text-center py-0.5">v{__APP_VERSION__}</div>
}

function ShortcutHelp(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`w-full flex items-center justify-center gap-1 py-1 rounded text-[10px] transition-colors ${
          open
            ? 'text-accent bg-accent/10'
            : 'text-gray-600 hover:text-gray-400 hover:bg-surface-raised'
        }`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M6.5 6.5a1.5 1.5 0 013 0c0 1-1.5 1-1.5 2" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
        <span>Shortcuts</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-overlay border border-surface-border rounded-lg shadow-2xl p-3 space-y-2 z-50">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
            Keyboard Shortcuts
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">New session</span>
              <span className="flex gap-0.5">
                <Kbd>Ctrl</Kbd>
                <Kbd>Shift</Kbd>
                <Kbd>O</Kbd>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Focus / Grid</span>
              <span className="flex gap-0.5">
                <Kbd>Ctrl</Kbd>
                <Kbd>Shift</Kbd>
                <Kbd>X</Kbd>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Navigate sessions</span>
              <span className="flex gap-0.5">
                <Kbd>Alt</Kbd>
                <Kbd>&larr;</Kbd>
                <Kbd>&rarr;</Kbd>
                <Kbd>&uarr;</Kbd>
                <Kbd>&darr;</Kbd>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
