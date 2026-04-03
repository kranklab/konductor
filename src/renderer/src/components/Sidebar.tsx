import type { Project, Session, ViewMode } from '../types'
import logoSvg from '../assets/logo.svg'

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
  onRemoveProject
}: SidebarProps): React.JSX.Element {
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

          return (
            <div key={project.id} className="mb-1">
              {/* Project header */}
              <button
                onClick={() => onSelectProject(project.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left group transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface-raised'
                }`}
              >
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
                <span className="text-[10px] text-gray-600 shrink-0">
                  {projectSessions.length}
                </span>
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

              {/* Sessions within project */}
              {isActive && (
                <div className="ml-4 border-l border-surface-border">
                  {projectSessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      className={`w-full flex items-center gap-2 pl-3 pr-3 py-1 text-left transition-colors ${
                        session.id === activeSessionId
                          ? 'text-white bg-accent/10'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-surface-raised'
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          session.alive ? 'bg-green-400' : 'bg-red-400'
                        }`}
                      />
                      <span className="text-xs truncate">{session.title}</span>
                    </button>
                  ))}

                  {/* Add session within project */}
                  <button
                    onClick={() => onNewSession(project.id)}
                    className="w-full flex items-center gap-2 pl-3 pr-3 py-1 text-left text-gray-600 hover:text-accent transition-colors"
                  >
                    <span className="text-xs">+ session</span>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-surface-border px-3 py-2">
        <button
          onClick={onNewProject}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs text-gray-500 hover:text-accent hover:bg-surface-raised transition-colors"
          title="New project"
        >
          <span>+</span>
          <span>New Project</span>
        </button>
      </div>
    </div>
  )
}
