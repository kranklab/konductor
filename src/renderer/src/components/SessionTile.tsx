import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import type { Session } from '../types'

interface SessionTileProps {
  session: Session
  isActive: boolean
  onFocus: () => void
  onClose: () => void
  onResize: (cols: number, rows: number) => void
}

export default function SessionTile({
  session,
  isActive,
  onFocus,
  onClose,
  onResize
}: SessionTileProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const mountedRef = useRef(false)
  const onResizeRef = useRef(onResize)
  useEffect(() => {
    onResizeRef.current = onResize
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container || mountedRef.current) return

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    session.terminal.loadAddon(fitAddon)

    // Terminal might already be opened (e.g. returning from focus view).
    // If so, re-parent the existing DOM element instead of calling open() again.
    if (session.terminal.element) {
      container.appendChild(session.terminal.element)
    } else {
      session.terminal.open(container)
    }

    // Initial fit after the terminal is rendered
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        onResizeRef.current(session.terminal.cols, session.terminal.rows)
      } catch {
        // Container may not be visible yet
      }
    })

    mountedRef.current = true
  }, [session.terminal])

  // Re-fit when visibility or layout changes
  useEffect(() => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon) return

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        onResizeRef.current(session.terminal.cols, session.terminal.rows)
      } catch {
        // Ignore fit errors during transitions
      }
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [session.terminal])

  return (
    <div
      className={`relative rounded-lg border overflow-hidden cursor-pointer transition-colors ${
        isActive
          ? 'border-accent ring-1 ring-accent/30'
          : 'border-surface-border hover:border-surface-border/80'
      }`}
      onClick={onFocus}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-overlay border-b border-surface-border">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              session.alive ? 'bg-green-400' : 'bg-red-400'
            }`}
          />
          <span className="text-xs text-gray-400 truncate">{session.title}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="text-gray-500 hover:text-gray-300 text-xs px-1"
        >
          x
        </button>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="h-64 bg-surface-raised" />
    </div>
  )
}
