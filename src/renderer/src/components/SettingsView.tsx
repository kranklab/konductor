import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeftIcon, RefreshIcon } from './Icons'
import type { UpdateStatus, LogEntry } from '../../../preload/index'

const api = window.konductorAPI

interface SettingsViewProps {
  onBack: () => void
}

const levelColors: Record<LogEntry['level'], string> = {
  info: 'text-gray-400',
  warn: 'text-yellow-400',
  error: 'text-red-400'
}

const levelBadgeColors: Record<LogEntry['level'], string> = {
  info: 'bg-gray-700 text-gray-300',
  warn: 'bg-yellow-900/50 text-yellow-400',
  error: 'bg-red-900/50 text-red-400'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function SettingsView({ onBack }: SettingsViewProps): React.JSX.Element {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)

  useEffect(() => {
    return api.onUpdateStatus((status) => {
      setUpdateStatus(status)
      setChecking(false)
    })
  }, [])

  useEffect(() => {
    api.getLogs().then(setLogs)
    return api.onAppLog((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry]
        return next.length > 500 ? next.slice(-500) : next
      })
    })
  }, [])

  useEffect(() => {
    if (isAtBottom.current) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const handleScroll = useCallback(() => {
    const el = logContainerRef.current
    if (!el) return
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  const handleCheckForUpdates = useCallback(() => {
    setChecking(true)
    setUpdateStatus(null)
    api.checkForUpdates()
  }, [])

  const filteredLogs = filter
    ? logs.filter(
        (l) =>
          l.category.toLowerCase().includes(filter.toLowerCase()) ||
          l.message.toLowerCase().includes(filter.toLowerCase())
      )
    : logs

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border shrink-0">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          title="Back"
        >
          <ChevronLeftIcon />
        </button>
        <h2 className="text-sm font-semibold text-gray-200">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Update Section */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Updates
          </h3>
          <div className="bg-surface-raised border border-surface-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-200">Konductor v{__APP_VERSION__}</div>
                <div className="text-[10px] text-gray-600 mt-0.5">
                  {updateStatus === null && !checking && 'No update info yet'}
                  {checking && 'Checking for updates...'}
                  {updateStatus?.status === 'available' && (
                    <span className="text-yellow-400">
                      Downloading v{updateStatus.version}...
                    </span>
                  )}
                  {updateStatus?.status === 'ready' && (
                    <span className="text-accent">
                      v{updateStatus.version} ready to install
                    </span>
                  )}
                  {updateStatus?.status === 'error' && (
                    <span className="text-red-400">{updateStatus.message}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {updateStatus?.status === 'ready' ? (
                  <button
                    onClick={() => api.installUpdate()}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                  >
                    Restart & Update
                  </button>
                ) : (
                  <button
                    onClick={handleCheckForUpdates}
                    disabled={checking}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-gray-400 hover:text-gray-200 bg-surface border border-surface-border hover:border-gray-500 transition-colors disabled:opacity-50"
                  >
                    <RefreshIcon className={checking ? 'animate-spin' : ''} />
                    Check for updates
                  </button>
                )}
              </div>
            </div>

            {updateStatus?.status === 'available' && (
              <div className="w-full bg-surface rounded-full h-1">
                <div className="bg-yellow-400 h-1 rounded-full animate-pulse w-2/3" />
              </div>
            )}
          </div>
        </section>

        {/* App Logs Section */}
        <section className="flex flex-col min-h-0" style={{ height: 'calc(100vh - 280px)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              App Logs
            </h3>
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-surface border border-surface-border rounded px-2 py-1 text-[10px] text-gray-300 placeholder-gray-600 w-40 focus:outline-none focus:border-gray-500"
            />
          </div>
          <div
            ref={logContainerRef}
            onScroll={handleScroll}
            className="flex-1 bg-surface-raised border border-surface-border rounded-lg overflow-y-auto font-mono text-[11px] leading-relaxed"
          >
            {filteredLogs.length === 0 ? (
              <div className="p-4 text-gray-600 text-center text-xs">No logs yet</div>
            ) : (
              <div className="p-2 space-y-px">
                {filteredLogs.map((entry, i) => (
                  <div key={i} className="flex gap-2 px-1 py-0.5 hover:bg-white/[0.02] rounded">
                    <span className="text-gray-600 shrink-0">{formatTime(entry.timestamp)}</span>
                    <span
                      className={`shrink-0 px-1 rounded text-[9px] leading-relaxed ${levelBadgeColors[entry.level]}`}
                    >
                      {entry.category}
                    </span>
                    <span className={levelColors[entry.level]}>{entry.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
