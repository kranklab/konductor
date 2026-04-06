import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import type { ShellTerminal } from '../types'

interface TerminalPanelProps {
  terminals: ShellTerminal[]
  activeTerminalId: string | null
  onSetActiveTerminal: (id: string) => void
  onCreateTerminal: () => void
  onKillTerminal: (id: string) => void
  onResize: (terminalId: string, cols: number, rows: number) => void
  onCollapse: () => void
  onSendToSession: (terminalId: string) => void
}

export default function TerminalPanel({
  terminals,
  activeTerminalId,
  onSetActiveTerminal,
  onCreateTerminal,
  onKillTerminal,
  onResize,
  onCollapse,
  onSendToSession
}: TerminalPanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const onResizeRef = useRef(onResize)
  useEffect(() => {
    onResizeRef.current = onResize
  })

  const activeTerminal = terminals.find((t) => t.id === activeTerminalId) ?? null

  // Mount/remount the active terminal
  useEffect(() => {
    const container = containerRef.current
    if (!container || !activeTerminal) return

    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    activeTerminal.terminal.loadAddon(fitAddon)

    if (activeTerminal.terminal.element) {
      container.appendChild(activeTerminal.terminal.element)
    } else {
      activeTerminal.terminal.open(container)
    }

    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        onResizeRef.current(
          activeTerminal.id,
          activeTerminal.terminal.cols,
          activeTerminal.terminal.rows
        )
      } catch {
        // ignore
      }
      activeTerminal.terminal.focus()
    })
  }, [activeTerminal])

  // ResizeObserver for auto-fitting
  useEffect(() => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon || !activeTerminal) return

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        onResizeRef.current(
          activeTerminal.id,
          activeTerminal.terminal.cols,
          activeTerminal.terminal.rows
        )
      } catch {
        // ignore
      }
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [activeTerminal])

  return (
    <div className="h-full flex flex-col bg-surface-raised">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-surface-overlay border-b border-surface-border shrink-0 min-h-[32px]">
        {terminals.map((t, i) => (
          <div
            key={t.id}
            className={`group flex items-center gap-1 px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
              t.id === activeTerminalId
                ? 'bg-surface-raised text-gray-200'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => onSetActiveTerminal(t.id)}
          >
            <span>Terminal {i + 1}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onKillTerminal(t.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all ml-0.5"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={onCreateTerminal}
          className="text-gray-500 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-surface-raised transition-colors ml-1"
          title="New terminal"
        >
          +
        </button>
        <div className="flex-1" />
        {activeTerminalId && (
          <button
            onClick={() => onSendToSession(activeTerminalId)}
            className="text-gray-500 hover:text-accent text-xs px-1.5 py-0.5 transition-colors"
            title="Send terminal output to Claude session"
          >
            &uarr; Send to session
          </button>
        )}
        <button
          onClick={onCollapse}
          className="text-gray-500 hover:text-gray-300 text-xs px-1.5 py-0.5 transition-colors"
          title="Collapse panel"
        >
          &rsaquo;
        </button>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
