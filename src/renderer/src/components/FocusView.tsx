import { useState, useRef, useCallback } from 'react'
import type { Session, ShellTerminal, ChangedFile } from '../types'
import { useTerminalMount } from '../hooks/useTerminalMount'
import { stripAnsi } from '../../../shared/stripAnsi'
import TerminalPanel from './TerminalPanel'
import ChangesPanel from './ChangesPanel'

interface FocusViewProps {
  session: Session
  projectName: string
  changes: ChangedFile[]
  onBack: () => void
  onClose: () => void
  onResume: () => void
  onResize: (cols: number, rows: number) => void
  onUpdateSummary: (summary: string) => void
  terminals: ShellTerminal[]
  activeTerminalId: string | null
  onSetActiveTerminal: (id: string) => void
  onCreateTerminal: () => void
  onKillTerminal: (id: string) => void
  onResizeTerminal: (terminalId: string, cols: number, rows: number) => void
}

export default function FocusView({
  session,
  projectName,
  changes,
  onBack,
  onClose,
  onResume,
  onResize,
  onUpdateSummary,
  terminals,
  activeTerminalId,
  onSetActiveTerminal,
  onCreateTerminal,
  onKillTerminal,
  onResizeTerminal
}: FocusViewProps): React.JSX.Element {
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState('')
  const summaryInputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useTerminalMount(containerRef, session, onResize, { clearContainer: true, autoFocus: true })

  const handleSendToSession = useCallback(
    async (terminalId: string) => {
      const raw = await window.konductorAPI.getTerminalScrollback(terminalId)
      const clean = stripAnsi(raw).trimEnd()
      if (!clean) return
      const message = `Here is the output from my shell terminal:\n\n\`\`\`\n${clean}\n\`\`\`\n`
      window.konductorAPI.writeToSession(session.id, message + '\n')
    },
    [session.id]
  )

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
            <span className="text-sm text-gray-500">{projectName}</span>
            <span className="text-sm text-gray-500">/</span>
            <span className="text-sm text-gray-300">{session.title}</span>
            {session.issue && (
              <button
                onClick={() => window.konductorAPI.openExternal(session.issue!.url)}
                className="text-xs shrink-0 hover:underline text-blue-400"
                title={`Issue #${session.issue.number}`}
              >
                Issue #{session.issue.number}
              </button>
            )}
            {session.pr && session.pr.state !== 'none' && (
              <button
                onClick={() => window.konductorAPI.openExternal(session.pr!.url)}
                className={`text-xs shrink-0 hover:underline ${
                  session.pr.state === 'merged'
                    ? 'text-purple-400'
                    : session.pr.state === 'closed'
                      ? 'text-red-400'
                      : 'text-green-400'
                }`}
                title={`PR #${session.pr.number} (${session.pr.state})`}
              >
                PR #{session.pr.number}
              </button>
            )}
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
          {!session.dormant && (
            <button
              onClick={
                terminals.length > 0 && terminalCollapsed
                  ? () => setTerminalCollapsed(false)
                  : onCreateTerminal
              }
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-surface-border hover:border-accent/50 transition-colors"
              title={
                terminals.length > 0 && terminalCollapsed
                  ? 'Show terminals'
                  : 'Open a shell terminal'
              }
            >
              Terminal
            </button>
          )}
          {!session.dormant && (
            <button
              onClick={() => setShowChanges((v) => !v)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                showChanges
                  ? 'text-white border-accent/50 bg-accent/10'
                  : 'text-gray-400 hover:text-white border-surface-border hover:border-accent/50'
              }`}
            >
              Changes
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 transition-colors"
          >
            {session.dormant ? 'Dismiss' : 'Exit'}
          </button>
        </div>
      </div>

      {/* Terminal + dormant resume overlay + side panels */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Changes panel (left side) */}
        {showChanges && !session.dormant && (
          <>
            <div className="w-[350px] min-w-[250px] max-w-[500px] shrink-0">
              <ChangesPanel cwd={session.cwd} changes={changes} />
            </div>
            <div className="w-px bg-surface-border shrink-0" />
          </>
        )}

        {/* Claude session terminal */}
        <div
          ref={containerRef}
          className={`bg-surface-raised min-w-0 flex-1 ${session.dormant ? 'invisible' : ''}`}
        />

        {/* Dormant resume overlay */}
        {session.dormant && (
          <div className="absolute inset-0 bg-surface-raised flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Session is paused</p>
              <button
                onClick={onResume}
                className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm font-medium"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
                Resume
              </button>
            </div>
          </div>
        )}

        {/* Shell terminals panel (right side) */}
        {terminals.length > 0 && !session.dormant && (
          <>
            <div className="w-px bg-surface-border shrink-0" />
            {terminalCollapsed ? (
              <button
                onClick={() => setTerminalCollapsed(false)}
                className="w-8 shrink-0 flex flex-col items-center justify-center gap-1 bg-surface-overlay hover:bg-surface-raised transition-colors group"
                title="Expand terminals"
              >
                <span className="text-gray-500 group-hover:text-gray-300 text-xs [writing-mode:vertical-lr] rotate-180">
                  Terminal
                </span>
              </button>
            ) : (
              <div className="w-[45%] min-w-[300px] max-w-[600px] shrink-0">
                <TerminalPanel
                  terminals={terminals}
                  activeTerminalId={activeTerminalId}
                  onSetActiveTerminal={onSetActiveTerminal}
                  onCreateTerminal={onCreateTerminal}
                  onKillTerminal={onKillTerminal}
                  onResize={onResizeTerminal}
                  onCollapse={() => setTerminalCollapsed(true)}
                  onSendToSession={handleSendToSession}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
