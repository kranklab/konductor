import { randomUUID } from 'crypto'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import * as nodePty from 'node-pty'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createFileWatcher, FileWatcher } from './fileWatcher'
import { shellQuote } from './shellEscape'
import { ScrollbackBuffer } from './ringBuffer'

const DEV_PLUGIN_PATH = join(__dirname, '../../claude-code-plugin')
const STATE_DIR = join(tmpdir(), 'konductor-state')

const MARKETPLACE_REPO = 'kranklab/konductor'
const MARKETPLACE_PLUGIN = 'konductor'

const MAX_SCROLLBACK_BYTES = 256 * 1024 // 256KB per session

export interface SessionEntry {
  pty: nodePty.IPty
  cwd: string
  claudeSessionId: string
  watcher: FileWatcher
  scrollback: ScrollbackBuffer
  alive: boolean
}

export interface SessionInfo {
  id: string
  cwd: string
  claudeSessionId: string
  alive: boolean
}

const sessions = new Map<string, SessionEntry>()
let nextId = 1

// Resolve the full path to `claude` using the user's login shell,
// since Electron's main process may not inherit shell profile PATH.
function getShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/bash'
}

let resolvedClaudePath: string | null = null
function getClaudePath(): string {
  if (resolvedClaudePath) return resolvedClaudePath
  try {
    const shell = getShell()
    resolvedClaudePath = execFileSync(shell, ['-lc', 'which claude'], {
      encoding: 'utf-8'
    }).trim()
  } catch {
    // Fallback — hope it's in PATH
    resolvedClaudePath = 'claude'
  }
  return resolvedClaudePath
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

let cachedEnv: Record<string, string> | null = null
function getEnv(): Record<string, string> {
  if (!cachedEnv) cachedEnv = getShellEnv()
  return cachedEnv
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
    return getEnv()
  }
}

/** Resolve a worktree path back to the project root, or return cwd as-is. */
function resolveProjectRoot(cwd: string): string {
  const worktreeMarker = `${join('.konductor', 'worktrees')}/`
  const idx = cwd.indexOf(worktreeMarker)
  if (idx !== -1) return cwd.slice(0, idx)
  return cwd
}

function detectEnvScript(cwd: string): string | null {
  const root = resolveProjectRoot(cwd)
  const candidate = join(root, '.konductor', 'envrc.sh')
  return existsSync(candidate) ? candidate : null
}

export function listEnvScripts(cwd: string): string[] {
  const dir = join(cwd, '.konductor')
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sh'))
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

function spawnClaude(
  cwd: string,
  claudeSessionId: string,
  name: string,
  resume: boolean,
  prompt?: string,
  env?: Record<string, string>
): nodePty.IPty {
  const args = resume
    ? ['--resume', claudeSessionId]
    : ['--session-id', claudeSessionId, '--name', name]

  // In dev, load the plugin from the local directory.
  // In production, the plugin is installed from the GitHub marketplace.
  if (is.dev) {
    args.push('--plugin-dir', DEV_PLUGIN_PATH)
  }

  if (prompt && !resume) {
    args.push('--prompt', prompt)
  }

  console.log(`[session] spawn: ${getClaudePath()} ${args.join(' ')}  cwd=${cwd}`)

  return nodePty.spawn(getClaudePath(), args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...(env ?? getEnv()), KONDUCTOR_STATE_DIR: STATE_DIR }
  })
}

export function createSession(
  cwd: string,
  window: BrowserWindow,
  opts?: {
    claudeSessionId?: string
    name?: string
    resume?: boolean
    prompt?: string
    envScript?: string
  }
): { id: string; claudeSessionId: string } {
  const id = `session-${nextId++}`
  const claudeSessionId = opts?.claudeSessionId ?? randomUUID()
  const name = opts?.name ?? `Session ${nextId - 1}`
  const resume = opts?.resume ?? false
  const envScript = opts?.envScript ?? detectEnvScript(cwd)
  const env = envScript ? getProjectEnv(envScript, cwd) : undefined

  console.log(`[session] createSession id=${id} claude=${claudeSessionId} resume=${resume} cwd=${cwd}`)

  const pty = spawnClaude(cwd, claudeSessionId, name, resume, opts?.prompt, env)

  const entry: SessionEntry = {
    pty,
    cwd,
    claudeSessionId,
    watcher: createFileWatcher(id, cwd, window),
    scrollback: new ScrollbackBuffer(MAX_SCROLLBACK_BYTES),
    alive: true
  }

  pty.onData((data) => {
    entry.scrollback.push(data)

    if (!window.isDestroyed()) {
      window.webContents.send('pty-output', { sessionId: id, data })
    }
  })

  pty.onExit(({ exitCode }) => {
    console.log(`[session] pty-exit id=${id} claude=${claudeSessionId} exitCode=${exitCode}`)
    entry.alive = false
    if (!window.isDestroyed()) {
      window.webContents.send('pty-exit', { sessionId: id, exitCode })
    }
    const e = sessions.get(id)
    if (e) {
      e.watcher.close()
      sessions.delete(id)
    }
  })

  sessions.set(id, entry)
  return { id, claudeSessionId }
}

export function listSessions(): SessionInfo[] {
  const result: SessionInfo[] = []
  for (const [id, entry] of sessions) {
    result.push({
      id,
      cwd: entry.cwd,
      claudeSessionId: entry.claudeSessionId,
      alive: entry.alive
    })
  }
  return result
}

export function getSessionScrollback(sessionId: string): string {
  const entry = sessions.get(sessionId)
  return entry ? entry.scrollback.join() : ''
}

export function writeToSession(sessionId: string, data: string): void {
  const entry = sessions.get(sessionId)
  if (entry) {
    entry.pty.write(data)
  }
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const entry = sessions.get(sessionId)
  if (entry) {
    entry.pty.resize(cols, rows)
  }
}

export function killSession(sessionId: string): void {
  const entry = sessions.get(sessionId)
  if (entry) {
    // Clean up before pty.kill() so the onExit callback (which also
    // tries to clean up) finds the session already removed and no-ops.
    entry.alive = false
    entry.watcher.close()
    sessions.delete(sessionId)
    entry.pty.kill()
  }
}

export function killAllSessions(): void {
  for (const [id, entry] of sessions) {
    entry.alive = false
    entry.watcher.close()
    sessions.delete(id)
    entry.pty.kill()
  }
}

export function getSessionCwd(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.cwd
}

export function getAllSessionCwds(): string[] {
  return [...sessions.values()].map((s) => s.cwd)
}

export function getSessionChanges(sessionId: string): import('./fileWatcher').ChangedFile[] {
  const entry = sessions.get(sessionId)
  return entry?.watcher.getChanges() ?? []
}

/**
 * Ensure the Konductor plugin is installed from the GitHub marketplace.
 * Called once at app startup in production builds.
 */
export function ensurePluginInstalled(): void {
  if (is.dev) return

  const claude = getClaudePath()
  const env = getEnv()
  const opts = { encoding: 'utf-8' as const, env, timeout: 30000 }

  try {
    // Add the marketplace (idempotent — no-ops if already added)
    execFileSync(claude, ['plugin', 'marketplace', 'add', MARKETPLACE_REPO], opts)
  } catch (err) {
    console.warn('[plugin] Failed to add marketplace:', (err as Error).message)
  }

  try {
    // Install the plugin (idempotent — no-ops if already installed)
    execFileSync(claude, ['plugin', 'install', MARKETPLACE_PLUGIN], opts)
  } catch (err) {
    console.warn('[plugin] Failed to install plugin:', (err as Error).message)
  }
}

export { STATE_DIR as sessionStateDir, getClaudePath, getEnv }
