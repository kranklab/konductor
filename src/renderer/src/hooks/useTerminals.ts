import { useState, useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import type { ShellTerminal } from '../types'
import { TERM_THEME } from '../termTheme'

const api = window.konductorAPI

function isAppShortcut(e: KeyboardEvent): boolean {
  if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.startsWith('Arrow')) return true
  if (e.ctrlKey && e.shiftKey && e.key === 'X') return true
  if (e.ctrlKey && e.shiftKey && e.key === 'O') return true
  return false
}

function createXterm(): Terminal {
  const term = new Terminal({
    theme: TERM_THEME,
    fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true
  })
  term.attachCustomKeyEventHandler((e) => {
    if (isAppShortcut(e)) return false
    return true
  })
  return term
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTerminals() {
  const [terminals, setTerminals] = useState<ShellTerminal[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const terminalsRef = useRef<ShellTerminal[]>([])

  useEffect(() => {
    terminalsRef.current = terminals
  }, [terminals])

  // Subscribe to terminal output/exit
  useEffect(() => {
    const unsubOutput = api.onTerminalOutput((terminalId, data) => {
      const t = terminalsRef.current.find((t) => t.id === terminalId)
      if (t) {
        t.terminal.write(data)
      }
    })

    const unsubExit = api.onTerminalExit((terminalId) => {
      const t = terminalsRef.current.find((t) => t.id === terminalId)
      if (t) {
        t.terminal.dispose()
      }
      setTerminals((prev) => prev.filter((t) => t.id !== terminalId))
      setActiveTerminalId((prev) => {
        if (prev === terminalId) {
          const remaining = terminalsRef.current.filter((t) => t.id !== terminalId)
          return remaining.length > 0 ? remaining[0].id : null
        }
        return prev
      })
    })

    return () => {
      unsubOutput()
      unsubExit()
    }
  }, [])

  const createTerminal = useCallback(async (sessionId: string, cwd: string, envScript?: string) => {
    const { id } = await api.createTerminal(sessionId, cwd, envScript)

    const terminal = createXterm()
    terminal.onData((data) => {
      api.writeToTerminal(id, data)
    })

    const shellTerminal: ShellTerminal = {
      id,
      sessionId,
      terminal,
      alive: true
    }

    setTerminals((prev) => [...prev, shellTerminal])
    setActiveTerminalId(id)
    return id
  }, [])

  const killTerminal = useCallback((terminalId: string) => {
    const t = terminalsRef.current.find((t) => t.id === terminalId)
    if (t) {
      api.killTerminal(terminalId)
      t.terminal.dispose()
      setTerminals((prev) => prev.filter((t) => t.id !== terminalId))
      setActiveTerminalId((prev) => {
        if (prev === terminalId) {
          const remaining = terminalsRef.current.filter((t) => t.id !== terminalId)
          return remaining.length > 0 ? remaining[0].id : null
        }
        return prev
      })
    }
  }, [])

  const resizeTerminal = useCallback((terminalId: string, cols: number, rows: number) => {
    api.resizeTerminal(terminalId, cols, rows)
  }, [])

  const killSessionTerminals = useCallback((sessionId: string) => {
    const toKill = terminalsRef.current.filter((t) => t.sessionId === sessionId)
    for (const t of toKill) {
      api.killTerminal(t.id)
      t.terminal.dispose()
    }
    setTerminals((prev) => prev.filter((t) => t.sessionId !== sessionId))
    setActiveTerminalId((prev) => {
      if (prev && toKill.some((t) => t.id === prev)) return null
      return prev
    })
  }, [])

  const getSessionTerminals = useCallback(
    (sessionId: string) => {
      return terminals.filter((t) => t.sessionId === sessionId)
    },
    [terminals]
  )

  return {
    terminals,
    activeTerminalId,
    setActiveTerminalId,
    createTerminal,
    killTerminal,
    resizeTerminal,
    killSessionTerminals,
    getSessionTerminals
  }
}
