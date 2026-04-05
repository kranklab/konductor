import { useEffect, useRef, type RefObject } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import type { Session } from '../types'

interface UseTerminalMountOptions {
  /** Clear container children before mounting (needed when session can change). */
  clearContainer?: boolean
  /** Focus the terminal after initial fit. */
  autoFocus?: boolean
}

/**
 * Mounts a session's xterm terminal into a container div, handles FitAddon
 * lifecycle, ResizeObserver-based auto-fitting, and PTY resize notifications.
 *
 * If session.terminal is null (dormant session), the hook is a no-op.
 */
export function useTerminalMount(
  containerRef: RefObject<HTMLDivElement | null>,
  session: Session,
  onResize: (cols: number, rows: number) => void,
  options?: UseTerminalMountOptions
): void {
  const fitAddonRef = useRef<FitAddon | null>(null)
  const mountedRef = useRef(false)
  const onResizeRef = useRef(onResize)

  useEffect(() => {
    onResizeRef.current = onResize
  })

  const clearContainer = options?.clearContainer ?? false
  const autoFocus = options?.autoFocus ?? false

  // Mount terminal into container
  useEffect(() => {
    const container = containerRef.current
    const terminal = session.terminal
    if (!container || !terminal) return

    if (clearContainer) {
      // Always remount when session changes (e.g. FocusView switching sessions)
      while (container.firstChild) {
        container.removeChild(container.firstChild)
      }
      mountedRef.current = false
    }

    if (!mountedRef.current) {
      const fitAddon = new FitAddon()
      fitAddonRef.current = fitAddon
      terminal.loadAddon(fitAddon)

      if (terminal.element) {
        container.appendChild(terminal.element)
      } else {
        terminal.open(container)
      }

      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
          onResizeRef.current(terminal.cols, terminal.rows)
        } catch {
          // Container may not be visible yet
        }
        if (autoFocus) {
          terminal.focus()
        }
      })

      mountedRef.current = true
    } else if (terminal.element) {
      // Re-parent existing element (e.g. returning from another view)
      container.appendChild(terminal.element)

      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit()
          onResizeRef.current(terminal.cols, terminal.rows)
        } catch {
          // ignore
        }
      })
    }
  }, [session, clearContainer, autoFocus, containerRef])

  // ResizeObserver for continuous fit-on-resize
  useEffect(() => {
    const fitAddon = fitAddonRef.current
    const terminal = session.terminal
    if (!fitAddon || !terminal) return

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        onResizeRef.current(terminal.cols, terminal.rows)
      } catch {
        // Ignore fit errors during transitions
      }
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [session, containerRef])
}
