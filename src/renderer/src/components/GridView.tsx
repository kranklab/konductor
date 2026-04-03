import type { Project, Session } from '../types'
import logoSvg from '../assets/logo.svg'
import SessionTile from './SessionTile'

interface GridViewProps {
  project: Project | null
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onFocusSession: (id: string) => void
  onCloseSession: (id: string) => void
  onResizeSession: (id: string, cols: number, rows: number) => void
  onNewSession: () => void
  onNewProject: () => void
}

export default function GridView({
  project,
  sessions,
  activeSessionId,
  onSelectSession,
  onFocusSession,
  onCloseSession,
  onResizeSession,
  onNewSession,
  onNewProject
}: GridViewProps): React.JSX.Element {
  if (!project) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <img src={logoSvg} alt="Konductor" className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-300 mb-2">Konductor</h1>
          <p className="text-gray-500 mb-6 text-sm">Claude Code Session Manager</p>
          <button
            onClick={onNewProject}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            + New Project
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-medium text-gray-300">{project.name}</h2>
        <span className="text-xs text-gray-600">{project.cwd}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sessions.map((session) => (
          <SessionTile
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSelect={() => onSelectSession(session.id)}
            onFocus={() => onFocusSession(session.id)}
            onClose={() => onCloseSession(session.id)}
            onResize={(cols, rows) => onResizeSession(session.id, cols, rows)}
          />
        ))}

        {/* New session button */}
        <button
          onClick={onNewSession}
          className="h-64 rounded-lg border border-dashed border-surface-border hover:border-accent/50 hover:bg-surface-overlay/50 transition-colors flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-300"
        >
          <span className="text-3xl font-light">+</span>
          <span className="text-sm">New Session</span>
        </button>
      </div>
    </div>
  )
}
