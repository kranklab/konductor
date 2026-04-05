import { useState, useEffect, useRef, useCallback } from 'react'
import type { Session, ChangedFile } from '../types'
import { useTerminalMount } from '../hooks/useTerminalMount'

interface ChangesViewProps {
  session: Session
  changes: ChangedFile[]
  onBack: () => void
  onResize: (cols: number, rows: number) => void
}

const typeColors: Record<ChangedFile['type'], string> = {
  add: 'text-green-400',
  change: 'text-yellow-400',
  unlink: 'text-red-400'
}

const typeLabels: Record<ChangedFile['type'], string> = {
  add: 'A',
  change: 'M',
  unlink: 'D'
}

function useDrag(
  direction: 'horizontal' | 'vertical',
  initial: number,
  min: number,
  max: number
): [number, (e: React.MouseEvent) => void] {
  const [size, setSize] = useState(initial)
  const dragging = useRef(false)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      const startPos = direction === 'horizontal' ? e.clientX : e.clientY
      const startSize = size

      document.body.style.userSelect = 'none'
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'

      const onMove = (ev: MouseEvent): void => {
        const pos = direction === 'horizontal' ? ev.clientX : ev.clientY
        const delta = pos - startPos
        setSize(Math.max(min, Math.min(max, startSize + delta)))
      }

      const onUp = (): void => {
        dragging.current = false
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [direction, size, min, max]
  )

  return [size, onMouseDown]
}

export default function ChangesView({
  session,
  changes,
  onBack,
  onResize
}: ChangesViewProps): React.JSX.Element {
  type DiffLine = { type: 'add' | 'remove' | 'context' | 'header'; text: string }

  const [selectedFile, setSelectedFile] = useState<ChangedFile | null>(null)
  const [diffResult, setDiffResult] = useState<{ path: string; lines: DiffLine[] } | null>(null)
  const termContainerRef = useRef<HTMLDivElement>(null)

  const [leftWidth, onDragH] = useDrag('horizontal', 480, 200, 900)
  const [treeHeight, onDragV] = useDrag('vertical', 180, 60, 600)

  useTerminalMount(termContainerRef, session, onResize)

  // Load diff when file selected
  useEffect(() => {
    if (!selectedFile) return

    let cancelled = false
    const isUntracked = selectedFile.type === 'add'
    window.konductorAPI
      .getDiff(session.cwd, selectedFile.path, isUntracked)
      .then((raw) => {
        if (cancelled) return
        const lines: DiffLine[] = []
        for (const line of raw.split('\n')) {
          if (line.startsWith('@@')) {
            lines.push({ type: 'header', text: line })
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            lines.push({ type: 'add', text: line.substring(1) })
          } else if (
            line.startsWith('diff ') ||
            line.startsWith('index ') ||
            line.startsWith('---') ||
            line.startsWith('+++') ||
            line.startsWith('\\')
          ) {
            // skip diff metadata lines
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lines.push({ type: 'remove', text: line.substring(1) })
          } else {
            lines.push({ type: 'context', text: line.startsWith(' ') ? line.substring(1) : line })
          }
        }
        setDiffResult({ path: selectedFile.path, lines })
      })
      .catch(() => {
        if (!cancelled)
          setDiffResult({
            path: selectedFile.path,
            lines: [{ type: 'context', text: '(unable to load diff)' }]
          })
      })

    return () => {
      cancelled = true
    }
  }, [selectedFile, session.cwd])

  // Derive loading and visible lines from state
  const loadingContent = selectedFile != null && diffResult?.path !== selectedFile.path
  const visibleDiffLines =
    selectedFile && diffResult?.path === selectedFile.path ? diffResult.lines : []

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center px-4 py-2 bg-surface-overlay border-b border-surface-border shrink-0">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          &larr; Back
        </button>
        <div className="w-px h-4 bg-surface-border mx-3" />
        <span className="text-sm text-gray-300">Changes &middot; {session.title}</span>
        <span className="text-xs text-gray-500 ml-2">
          {changes.length} file{changes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Split layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel — file tree + preview */}
        <div className="shrink-0 flex flex-col" style={{ width: leftWidth }}>
          {/* File tree */}
          <div className="overflow-y-auto p-2 shrink-0" style={{ height: treeHeight }}>
            {changes.length === 0 ? (
              <div className="text-gray-500 text-xs p-4 text-center">No changes detected</div>
            ) : (
              <ul className="space-y-0.5">
                {changes.map((file) => (
                  <li key={file.path}>
                    <button
                      onClick={() => setSelectedFile(file)}
                      className={`w-full text-left px-2 py-1 rounded text-xs font-mono flex items-center gap-2 transition-colors ${
                        selectedFile?.path === file.path
                          ? 'bg-accent/20 text-white'
                          : 'hover:bg-surface-overlay text-gray-400'
                      }`}
                    >
                      <span className={`${typeColors[file.type]} font-bold w-3 shrink-0`}>
                        {typeLabels[file.type]}
                      </span>
                      <span className="truncate">{file.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Vertical resize handle */}
          <div
            onMouseDown={onDragV}
            className="h-1 shrink-0 cursor-row-resize border-t border-surface-border hover:bg-accent/30 active:bg-accent/50 transition-colors"
          />

          {/* Diff preview */}
          <div className="flex-1 min-h-0 overflow-auto bg-surface-raised">
            {selectedFile ? (
              <>
                <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-surface-border sticky top-0 bg-surface-raised">
                  {selectedFile.path}
                </div>
                {loadingContent ? (
                  <div className="p-4 text-gray-500 text-xs">Loading...</div>
                ) : visibleDiffLines.length === 0 ? (
                  <div className="p-4 text-gray-500 text-xs">No diff available</div>
                ) : (
                  <div className="text-xs font-mono">
                    {visibleDiffLines.map((line, i) => {
                      if (line.type === 'header') {
                        return (
                          <div
                            key={i}
                            className="px-3 py-0.5 text-blue-400 bg-blue-400/5 border-y border-blue-400/10"
                          >
                            {line.text}
                          </div>
                        )
                      }

                      const bg =
                        line.type === 'add'
                          ? 'bg-green-400/10'
                          : line.type === 'remove'
                            ? 'bg-red-400/10'
                            : ''

                      const markerColor =
                        line.type === 'add'
                          ? 'text-green-400'
                          : line.type === 'remove'
                            ? 'text-red-400'
                            : 'text-transparent'

                      const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '

                      return (
                        <div key={i} className={`flex ${bg}`}>
                          <span className={`shrink-0 w-5 text-center select-none ${markerColor}`}>
                            {marker}
                          </span>
                          <span className="px-2 whitespace-pre-wrap break-all text-gray-300">
                            {line.text}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                Select a file to preview
              </div>
            )}
          </div>
        </div>

        {/* Horizontal resize handle */}
        <div
          onMouseDown={onDragH}
          className="w-1 shrink-0 cursor-col-resize border-l border-surface-border hover:bg-accent/30 active:bg-accent/50 transition-colors"
        />

        {/* Right panel — terminal */}
        <div ref={termContainerRef} className="flex-1 bg-surface-raised" />
      </div>
    </div>
  )
}
