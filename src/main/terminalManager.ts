import { BrowserWindow } from 'electron'
import * as nodePty from 'node-pty'
import { ScrollbackBuffer } from './ringBuffer'
import { shellQuote } from './shellEscape'
import { execFileSync } from 'child_process'

const MAX_SCROLLBACK_BYTES = 256 * 1024

export interface TerminalEntry {
  pty: nodePty.IPty
  sessionId: string
  scrollback: ScrollbackBuffer
  alive: boolean
}

export interface TerminalInfo {
  id: string
  sessionId: string
  alive: boolean
}

const terminals = new Map<string, TerminalEntry>()
let nextId = 1

function getShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/bash'
}

function getShellEnv(): Record<string, string> {
  try {
    const shell = getShell()
    const raw = execFileSync(shell, ['-lc', 'env'], { encoding: 'utf-8' })
    const env: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        env[line.substring(0, eq)] = line.substring(eq + 1)
      }
    }
    return env
  } catch {
    return process.env as Record<string, string>
  }
}

function getProjectEnv(envScript: string, cwd?: string): Record<string, string> {
  try {
    const shell = getShell()
    const raw = execFileSync(shell, ['-lc', `source ${shellQuote(envScript)} && env`], {
      encoding: 'utf-8',
      cwd
    })
    const env: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        env[line.substring(0, eq)] = line.substring(eq + 1)
      }
    }
    return env
  } catch {
    return getShellEnv()
  }
}

export function createTerminal(
  sessionId: string,
  cwd: string,
  window: BrowserWindow,
  envScript?: string
): { id: string } {
  const id = `terminal-${nextId++}`
  const env = envScript ? getProjectEnv(envScript, cwd) : getShellEnv()
  const shell = getShell()

  const pty = nodePty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env
  })

  const entry: TerminalEntry = {
    pty,
    sessionId,
    scrollback: new ScrollbackBuffer(MAX_SCROLLBACK_BYTES),
    alive: true
  }

  pty.onData((data) => {
    entry.scrollback.push(data)
    if (!window.isDestroyed()) {
      window.webContents.send('terminal-output', { terminalId: id, data })
    }
  })

  pty.onExit(({ exitCode }) => {
    entry.alive = false
    if (!window.isDestroyed()) {
      window.webContents.send('terminal-exit', { terminalId: id, exitCode })
    }
    terminals.delete(id)
  })

  terminals.set(id, entry)
  return { id }
}

export function getTerminalScrollback(terminalId: string): string {
  const entry = terminals.get(terminalId)
  return entry ? entry.scrollback.join() : ''
}

export function writeToTerminal(terminalId: string, data: string): void {
  const entry = terminals.get(terminalId)
  if (entry) {
    entry.pty.write(data)
  }
}

export function resizeTerminal(terminalId: string, cols: number, rows: number): void {
  const entry = terminals.get(terminalId)
  if (entry) {
    entry.pty.resize(cols, rows)
  }
}

export function killTerminal(terminalId: string): void {
  const entry = terminals.get(terminalId)
  if (entry) {
    entry.alive = false
    terminals.delete(terminalId)
    entry.pty.kill()
  }
}

export function killSessionTerminals(sessionId: string): void {
  for (const [id, entry] of terminals) {
    if (entry.sessionId === sessionId) {
      entry.alive = false
      terminals.delete(id)
      entry.pty.kill()
    }
  }
}

export function killAllTerminals(): void {
  for (const [id, entry] of terminals) {
    entry.alive = false
    terminals.delete(id)
    entry.pty.kill()
  }
}
