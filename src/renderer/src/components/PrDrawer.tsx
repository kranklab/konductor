import { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { PrDetail, PrCheckRun } from '../../../shared/types'

interface PrDrawerProps {
  cwd: string
  prNumber: number
  sessionId: string
  onClose: () => void
  onOpenExternal: (url: string) => void
}

type Tab = 'details' | 'builds'

const stateColors: Record<string, string> = {
  open: 'text-green-400',
  merged: 'text-purple-400',
  closed: 'text-red-400'
}

const stateBadge: Record<string, string> = {
  open: 'bg-green-400/10 border-green-400/30 text-green-400',
  merged: 'bg-purple-400/10 border-purple-400/30 text-purple-400',
  closed: 'bg-red-400/10 border-red-400/30 text-red-400'
}

function conclusionIcon(c: PrCheckRun): { icon: string; color: string } {
  if (c.conclusion === 'success') return { icon: '\u2713', color: 'text-green-400' }
  if (c.conclusion === 'failure') return { icon: '\u2717', color: 'text-red-400' }
  if (c.conclusion === 'skipped') return { icon: '\u2014', color: 'text-gray-500' }
  if (c.conclusion === 'neutral') return { icon: '\u25CB', color: 'text-gray-400' }
  if (c.status === 'in_progress' || c.status === 'queued')
    return { icon: '\u25CF', color: 'text-amber-400 animate-pulse' }
  return { icon: '?', color: 'text-gray-500' }
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function PrDrawer({
  cwd,
  prNumber,
  sessionId,
  onClose,
  onOpenExternal
}: PrDrawerProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('details')
  const [detail, setDetail] = useState<PrDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Reset handled via initial state; subsequent fetches reset in callbacks
    window.konductorAPI
      .getPrDetail(cwd, prNumber)
      .then((d) => {
        if (cancelled) return
        if (d) {
          setDetail(d)
          setError(null)
        } else {
          setError('Failed to load PR details')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load PR details')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cwd, prNumber])

  return (
    <div className="h-full flex flex-col bg-surface-raised">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-surface-overlay border-b border-surface-border shrink-0 min-h-[32px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-bold ${stateColors[detail?.state ?? 'open']}`}>
            PR #{prNumber}
          </span>
          {detail && <span className="text-xs text-gray-400 truncate">{detail.title}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onOpenExternal(detail?.url ?? '')}
            className="text-xs text-gray-500 hover:text-white px-1.5 py-0.5 transition-colors"
            title="Open on GitHub"
          >
            &#8599;
          </button>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-white px-1.5 py-0.5 transition-colors"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border shrink-0">
        {(['details', 'builds'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs px-3 py-1.5 transition-colors ${
              tab === t
                ? 'text-white border-b-2 border-accent'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'details' ? 'Details' : 'Builds'}
            {t === 'builds' && detail && detail.checks.length > 0 && (
              <span className="ml-1.5 text-gray-600">{detail.checks.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            Loading PR details...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400 text-xs">
            {error}
          </div>
        ) : detail ? (
          tab === 'details' ? (
            <DetailsTab detail={detail} onOpenExternal={onOpenExternal} />
          ) : (
            <BuildsTab
              cwd={cwd}
              checks={detail.checks}
              sessionId={sessionId}
              onOpenExternal={onOpenExternal}
            />
          )
        ) : null}
      </div>
    </div>
  )
}

function MdBody({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="pr-markdown text-xs text-gray-300">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  )
}

function DetailsTab({
  detail,
  onOpenExternal
}: {
  detail: PrDetail
  onOpenExternal: (url: string) => void
}): React.JSX.Element {
  return (
    <div className="p-3 space-y-4">
      {/* Meta */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded border ${stateBadge[detail.state]}`}>
            {detail.state}
          </span>
          {detail.labels.map((l) => (
            <span
              key={l}
              className="text-xs px-1.5 py-0.5 rounded bg-surface-overlay border border-surface-border text-gray-400"
            >
              {l}
            </span>
          ))}
        </div>
        <div className="text-xs text-gray-500 space-x-3">
          <span>{detail.author}</span>
          <span>
            {detail.branch} &rarr; {detail.baseBranch}
          </span>
        </div>
        <div className="text-xs text-gray-600 space-x-3">
          <span className="text-green-400">+{detail.additions}</span>
          <span className="text-red-400">-{detail.deletions}</span>
          <span>
            {detail.commits} commit{detail.commits !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Body */}
      {detail.body && (
        <div className="border-t border-surface-border pt-3">
          <MdBody content={detail.body} />
        </div>
      )}

      {/* Comments */}
      {detail.comments.length > 0 && (
        <div className="border-t border-surface-border pt-3 space-y-3">
          <span className="text-xs text-gray-500">
            {detail.comments.length} comment{detail.comments.length !== 1 ? 's' : ''}
          </span>
          {detail.comments.map((c, i) => (
            <div key={i} className="border border-surface-border rounded p-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 font-bold">{c.author}</span>
                <span className="text-gray-600">{relativeTime(c.createdAt)}</span>
              </div>
              <MdBody content={c.body} />
            </div>
          ))}
        </div>
      )}

      {detail.comments.length === 0 && !detail.body && (
        <div className="text-xs text-gray-600 text-center py-4">No description or comments</div>
      )}

      {/* Open on GitHub link */}
      <button
        onClick={() => onOpenExternal(detail.url)}
        className="text-xs text-accent hover:underline"
      >
        View on GitHub &rarr;
      </button>
    </div>
  )
}

function BuildsTab({
  cwd,
  checks,
  sessionId,
  onOpenExternal
}: {
  cwd: string
  checks: PrCheckRun[]
  sessionId: string
  onOpenExternal: (url: string) => void
}): React.JSX.Element {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({})

  const handleCheckClick = (check: PrCheckRun): void => {
    const key = check.url || check.name
    if (expandedCheck === key) {
      setExpandedCheck(null)
      return
    }
    setExpandedCheck(key)

    // Fetch logs if we haven't already and the check has a URL
    if (!logs[key] && check.url) {
      setLoadingLogs((prev) => ({ ...prev, [key]: true }))
      window.konductorAPI
        .getCheckRunLogs(cwd, check.url)
        .then((result) => {
          setLogs((prev) => ({ ...prev, [key]: result }))
        })
        .catch(() => {
          setLogs((prev) => ({ ...prev, [key]: 'Failed to fetch logs' }))
        })
        .finally(() => {
          setLoadingLogs((prev) => ({ ...prev, [key]: false }))
        })
    }
  }

  const handleSendToSession = (checkName: string, logContent: string): void => {
    const message = `Here are the failed CI build logs for "${checkName}":\n\n\`\`\`\n${logContent}\n\`\`\`\n`
    window.konductorAPI.writeToSession(sessionId, message + '\n')
  }

  if (checks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-xs">
        No checks found
      </div>
    )
  }

  const passed = checks.filter((c) => c.conclusion === 'success').length
  const failed = checks.filter((c) => c.conclusion === 'failure').length
  const pending = checks.filter((c) => c.status === 'in_progress' || c.status === 'queued').length

  return (
    <div className="p-3 space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-3 text-xs">
        {passed > 0 && <span className="text-green-400">{passed} passed</span>}
        {failed > 0 && <span className="text-red-400">{failed} failed</span>}
        {pending > 0 && <span className="text-amber-400">{pending} pending</span>}
      </div>

      {/* Check list */}
      <div className="space-y-1">
        {checks.map((c, i) => {
          const ci = conclusionIcon(c)
          const key = c.url || c.name
          const isExpanded = expandedCheck === key
          const isLoading = loadingLogs[key]
          const logContent = logs[key]

          return (
            <div key={i}>
              <button
                onClick={() => handleCheckClick(c)}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  isExpanded
                    ? 'bg-surface-overlay text-white'
                    : 'hover:bg-surface-overlay cursor-pointer'
                }`}
              >
                <span className={`shrink-0 font-mono ${ci.color}`}>{ci.icon}</span>
                <span className="text-gray-300 truncate flex-1">{c.name}</span>
                <span className="text-gray-600 shrink-0">
                  {c.conclusion || c.status || 'unknown'}
                </span>
              </button>

              {isExpanded && (
                <div className="mt-1 mx-1 rounded border border-surface-border overflow-hidden">
                  {/* Log toolbar */}
                  <div className="flex items-center justify-between px-2 py-1 bg-surface-overlay border-b border-surface-border">
                    <span className="text-xs text-gray-500">Logs</span>
                    <div className="flex items-center gap-2">
                      {logContent && !isLoading && (
                        <button
                          onClick={() => handleSendToSession(c.name, logContent)}
                          className="text-xs text-gray-500 hover:text-accent transition-colors"
                          title="Send logs to Claude session"
                        >
                          &uarr; Send to session
                        </button>
                      )}
                      {c.url && (
                        <button
                          onClick={() => onOpenExternal(c.url)}
                          className="text-xs text-gray-500 hover:text-white transition-colors"
                          title="Open on GitHub"
                        >
                          &#8599;
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Log content */}
                  <div className="max-h-[300px] overflow-auto bg-surface text-xs font-mono">
                    {isLoading ? (
                      <div className="p-3 text-gray-500">Fetching logs...</div>
                    ) : logContent ? (
                      <pre className="p-2 text-gray-400 whitespace-pre-wrap break-all leading-relaxed">
                        {logContent}
                      </pre>
                    ) : (
                      <div className="p-3 text-gray-600">No logs available</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
