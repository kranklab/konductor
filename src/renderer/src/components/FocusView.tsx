import { useState, useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import type { Session } from '../types'

interface FocusViewProps {
  session: Session
  onBack: () => void
  onShowChanges: () => void
  onClose: () => void
  onResize: (cols: number, rows: number) => void
  onUpdateSummary: (summary: string) => void
}

export default function FocusView({
  session,
  onBack,
  onShowChanges,
  onClose,
  onResize,
  onUpdateSummary
}: FocusViewProps): React.JSX.Element {
  const [editingSummary, setEditingSummary] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState('')
  const summaryInputRef = useRef<HTMLTextAreaElement>(null)
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
      session.terminal.focus()
    })
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
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white text-sm transition-colors shrink-0"
          >
            &larr; Grid
          </button>
          <div className="w-px h-4 bg-surface-border shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`w-2 h-2 rounded-full ${
                !session.alive
                  ? 'bg-red-400'
                  : session.activity === 'working'
                    ? 'bg-green-400 animate-pulse'
                    : session.activity === 'waiting'
                      ? 'bg-amber-400'
                      : 'bg-green-400'
              }`}
            />
            <span className="text-sm text-gray-300">{session.title}</span>
            <span className="text-xs text-gray-500">{session.cwd}</span>
          </div>
          <div className="w-px h-4 bg-surface-border shrink-0" />
          {editingSummary ? (
            <textarea
              ref={summaryInputRef}
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              onBlur={() => {
                onUpdateSummary(summaryDraft.trim())
                setEditingSummary(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onUpdateSummary(summaryDraft.trim())
                  setEditingSummary(false)
                }
                if (e.key === 'Escape') {
                  setEditingSummary(false)
                }
              }}
              className="flex-1 min-w-0 text-xs text-gray-300 bg-surface-raised border border-surface-border rounded px-2 py-1 resize-none outline-none focus:border-accent/50"
              rows={2}
              placeholder="Describe what this session is working on..."
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                if (session.summary) {
                  setSummaryDraft(session.summary)
                  setEditingSummary(true)
                  requestAnimationFrame(() => summaryInputRef.current?.focus())
                } else {
                  window.konductorAPI
                    .generateSummary(session.cwd, session.claudeSessionId)
                    .then((s) => {
                      if (s) {
                        onUpdateSummary(s)
                      } else {
                        setSummaryDraft('')
                        setEditingSummary(true)
                        requestAnimationFrame(() => summaryInputRef.current?.focus())
                      }
                    })
                }
              }}
              className="flex-1 min-w-0 text-left"
              title={session.summary ? 'Click to edit summary' : 'Generate summary'}
            >
              {session.summary ? (
                <span className="text-xs text-gray-400 line-clamp-2">{session.summary}</span>
              ) : (
                <span className="text-xs text-gray-600 italic">+ Generate summary</span>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
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
