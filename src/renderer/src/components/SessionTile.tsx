import { useState, useRef } from 'react'
import type { Session } from '../types'
import { useTerminalMount } from '../hooks/useTerminalMount'

interface SessionTileProps {
  session: Session
  isActive: boolean
  onSelect: () => void
  onFocus: () => void
  onClose: () => void
  onResume: () => void
  onResize: (cols: number, rows: number) => void
  onUpdateSummary: (summary: string) => void
}

export default function SessionTile({
  session,
  isActive,
  onSelect,
  onFocus,
  onClose,
  onResume,
  onResize,
  onUpdateSummary
}: SessionTileProps): React.JSX.Element {
  const [editingSummary, setEditingSummary] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useTerminalMount(containerRef, session, onResize)

  return (
    <div
      className={`relative rounded-lg border overflow-hidden cursor-pointer transition-colors ${
        isActive
          ? 'border-accent ring-1 ring-accent/30'
          : 'border-surface-border hover:border-surface-border/80'
      }`}
      onClick={() => {
        onSelect()
        session.terminal?.focus()
      }}
      onDoubleClick={onFocus}
    >
      {/* Header */}
      <div className="bg-surface-overlay border-b border-surface-border">
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
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
            />
            <span className="text-xs text-gray-400 truncate">{session.title}</span>
            <span className="text-[10px] text-gray-600 truncate">{session.cwd}</span>
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
        {editingSummary ? (
          <div className="px-3 pb-1.5">
            <textarea
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
              onClick={(e) => e.stopPropagation()}
              className="w-full text-[10px] text-gray-300 bg-surface-raised border border-surface-border rounded px-2 py-1 resize-none outline-none focus:border-accent/50"
              rows={2}
              placeholder="Describe what this session is working on..."
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (session.summary) {
                setSummaryDraft(session.summary)
                setEditingSummary(true)
              } else {
                // Auto-generate summary from transcript
                window.konductorAPI
                  .generateSummary(session.cwd, session.claudeSessionId)
                  .then((s) => {
                    if (s) {
                      onUpdateSummary(s)
                    } else {
                      setSummaryDraft('')
                      setEditingSummary(true)
                    }
                  })
              }
            }}
            className="w-full text-left px-3 pb-1.5"
            title={session.summary ? 'Click to edit summary' : 'Generate summary'}
          >
            {session.summary ? (
              <p className="text-[10px] text-gray-500 line-clamp-2">{session.summary}</p>
            ) : (
              <p className="text-[10px] text-gray-600 italic">+ Generate summary</p>
            )}
          </button>
        )}
      </div>

      {/* Terminal container */}
      {session.dormant ? (
        <div className="h-64 bg-surface-raised flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onResume()
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2l10 6-10 6V2z" />
            </svg>
            Resume
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="h-64 bg-surface-raised" />
      )}
    </div>
  )
}
