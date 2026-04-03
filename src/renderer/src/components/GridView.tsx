import type { Project, Session } from '../types'
import logoSvg from '../assets/logo.svg'
import SessionTile from './SessionTile'

export type GridCols = 1 | 2

interface GridViewProps {
  project: Project | null
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  gridCols: GridCols
  onSetGridCols: (cols: GridCols) => void
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
  gridCols: cols,
  onSetGridCols: setCols,
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
        <span className="text-xs text-gray-600 flex-1">{project.cwd}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCols(1)}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              cols === 1
                ? 'bg-accent/20 text-accent'
                : 'text-gray-500 hover:text-gray-300 hover:bg-surface-raised'
            }`}
            title="Single column"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="1" width="12" height="14" rx="1.5" />
            </svg>
          </button>
          <button
            onClick={() => setCols(2)}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              cols === 2
                ? 'bg-accent/20 text-accent'
                : 'text-gray-500 hover:text-gray-300 hover:bg-surface-raised'
            }`}
            title="Two columns"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="1" width="5.5" height="14" rx="1.5" />
              <rect x="9.5" y="1" width="5.5" height="14" rx="1.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
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
          className="h-64 rounded-lg border border-dashed border-surface-border hover:border-accent/50 hover:bg-surface-overlay/50 transition-colors flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-gray-300"
        >
          <span className="text-3xl font-light">+</span>
          <span className="text-sm">New Session</span>
          <div className="flex flex-col items-center gap-1.5 mt-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-600 font-mono">Ctrl</kbd>
              <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-600 font-mono">Shift</kbd>
              <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-600 font-mono">O</kbd>
            </span>
            <span className="flex items-center gap-1 text-[9px] text-gray-600">
              navigate
              <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-600 font-mono">Alt</kbd>
              <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-600 font-mono">&larr;</kbd>
              <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-600 font-mono">&rarr;</kbd>
              <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-600 font-mono">&uarr;</kbd>
              <kbd className="px-1 py-0.5 rounded bg-surface border border-surface-border text-[9px] text-gray-600 font-mono">&darr;</kbd>
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}
