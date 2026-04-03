import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import type { Session } from '../types'

interface FocusViewProps {
  session: Session
  onBack: () => void
  onShowChanges: () => void
  onClose: () => void
  onResize: (cols: number, rows: number) => void
}

export default function FocusView({
  session,
  onBack,
  onShowChanges,
  onClose,
  onResize
}: FocusViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const onResizeRef = useRef(onResize)
  useEffect(() => {
    onResizeRef.current = onResize
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear container when session changes
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    session.terminal.loadAddon(fitAddon)

    if (session.terminal.element) {
      container.appendChild(session.terminal.element)
    } else {
      session.terminal.open(container)
    }

    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        onResizeRef.current(session.terminal.cols, session.terminal.rows)
      } catch {
        // ignore
      }
    })

    session.terminal.focus()
  }, [session])

  useEffect(() => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon) return

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        onResizeRef.current(session.terminal.cols, session.terminal.rows)
      } catch {
        // ignore
      }
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [session])

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-overlay border-b border-surface-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            &larr; Grid
          </button>
          <div className="w-px h-4 bg-surface-border" />
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${session.alive ? 'bg-green-400' : 'bg-red-400'}`}
            />
            <span className="text-sm text-gray-300">{session.title}</span>
            <span className="text-xs text-gray-500">{session.cwd}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onShowChanges}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-surface-border hover:border-accent/50 transition-colors"
          >
            Changes
          </button>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 transition-colors"
          >
            Kill
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="flex-1 bg-surface-raised" />
    </div>
  )
}
