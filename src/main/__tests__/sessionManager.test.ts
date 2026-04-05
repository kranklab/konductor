import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BrowserWindow } from 'electron'

// Mock electron before importing the module under test
vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

// ─── node-pty mock with callback capture ──────────────────────────────

type DataCb = (data: string) => void
type ExitCb = (e: { exitCode: number }) => void

function createMockPty(): {
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  _dataCb: DataCb | null
  _exitCb: ExitCb | null
} {
  const pty = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    _dataCb: null as DataCb | null,
    _exitCb: null as ExitCb | null
  }
  pty.onData.mockImplementation((cb: DataCb) => {
    pty._dataCb = cb
    return { dispose: vi.fn() }
  })
  pty.onExit.mockImplementation((cb: ExitCb) => {
    pty._exitCb = cb
    return { dispose: vi.fn() }
  })
  return pty
}

let currentMockPty = createMockPty()

vi.mock('node-pty', () => ({
  default: {
    spawn: vi.fn(() => currentMockPty)
  },
  spawn: vi.fn(() => currentMockPty)
}))

// Mock fileWatcher
vi.mock('../fileWatcher', () => ({
  createFileWatcher: vi.fn(() => ({
    close: vi.fn(),
    getChanges: vi.fn(() => [])
  }))
}))

// Mock child_process
vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => '/usr/bin/claude')
}))

// Mock fs
const mockReaddirSync = vi.fn<(path: string) => string[]>(() => [])
const mockExistsSync = vi.fn<(path: string) => boolean>(() => false)
vi.mock('fs', () => ({
  existsSync: (path: string) => mockExistsSync(path),
  readdirSync: (path: string) => mockReaddirSync(path)
}))

import {
  createSession,
  killSession,
  killAllSessions,
  listSessions,
  getSessionScrollback,
  writeToSession,
  resizeSession,
  getSessionChanges,
  listEnvScripts
} from '../sessionManager'
import { createFileWatcher } from '../fileWatcher'
import * as nodePty from 'node-pty'

const mockWindow = {
  isDestroyed: vi.fn(() => false),
  webContents: { send: vi.fn() }
} as unknown as BrowserWindow

beforeEach(() => {
  vi.clearAllMocks()
  currentMockPty = createMockPty()
  vi.mocked(nodePty.spawn).mockReturnValue(currentMockPty as unknown as nodePty.IPty)
  mockWindow.isDestroyed = vi.fn(() => false)
  ;(mockWindow.webContents.send as ReturnType<typeof vi.fn>).mockClear()
})

afterEach(() => {
  // Clean up module-level session state between tests
  killAllSessions()
})

// ─── killSession (edge cases) ─────────────────────────────────────────

describe('killSession', () => {
  it('no-ops for unknown session id', () => {
    expect(() => killSession('nonexistent-session')).not.toThrow()
  })

  it('no-ops for already-killed session id', () => {
    expect(() => {
      killSession('nonexistent')
      killSession('nonexistent')
    }).not.toThrow()
  })
})

describe('killAllSessions', () => {
  it('no-ops when no sessions exist', () => {
    expect(() => killAllSessions()).not.toThrow()
  })
})

// ─── createSession ────────────────────────────────────────────────────

describe('createSession', () => {
  it('returns id and claudeSessionId', () => {
    const result = createSession('/tmp/test', mockWindow)

    expect(result.id).toMatch(/^session-\d+$/)
    expect(result.claudeSessionId).toBeTruthy()
    expect(typeof result.claudeSessionId).toBe('string')
  })

  it('spawns pty with correct cwd', () => {
    createSession('/tmp/project', mockWindow)

    expect(nodePty.spawn).toHaveBeenCalledTimes(1)
    const spawnCall = vi.mocked(nodePty.spawn).mock.calls[0]
    // 3rd arg is options object with cwd
    expect(spawnCall[2]).toMatchObject({ cwd: '/tmp/project' })
  })

  it('uses custom claudeSessionId when provided', () => {
    const result = createSession('/tmp/test', mockWindow, {
      claudeSessionId: 'custom-id-123'
    })

    expect(result.claudeSessionId).toBe('custom-id-123')
  })

  it('uses --resume flag when resume option is true', () => {
    createSession('/tmp/test', mockWindow, {
      claudeSessionId: 'session-to-resume',
      resume: true
    })

    const spawnCall = vi.mocked(nodePty.spawn).mock.calls[0]
    const args = spawnCall[1] as string[]
    expect(args).toContain('--resume')
    expect(args).toContain('session-to-resume')
  })

  it('uses --session-id and --name for non-resume sessions', () => {
    createSession('/tmp/test', mockWindow, {
      claudeSessionId: 'new-session',
      name: 'My Session'
    })

    const spawnCall = vi.mocked(nodePty.spawn).mock.calls[0]
    const args = spawnCall[1] as string[]
    expect(args).toContain('--session-id')
    expect(args).toContain('new-session')
    expect(args).toContain('--name')
    expect(args).toContain('My Session')
  })

  it('creates file watcher for session cwd', () => {
    const result = createSession('/tmp/watched', mockWindow)

    expect(createFileWatcher).toHaveBeenCalledWith(result.id, '/tmp/watched', mockWindow)
  })

  it('forwards pty data to window IPC', () => {
    const result = createSession('/tmp/test', mockWindow)

    // Simulate pty output
    currentMockPty._dataCb!('hello world')

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('pty-output', {
      sessionId: result.id,
      data: 'hello world'
    })
  })

  it('sends pty-exit on process exit', () => {
    const result = createSession('/tmp/test', mockWindow)

    // Simulate pty exit
    currentMockPty._exitCb!({ exitCode: 0 })

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('pty-exit', {
      sessionId: result.id,
      exitCode: 0
    })
  })
})

// ─── writeToSession / resizeSession ───────────────────────────────────

describe('writeToSession', () => {
  it('delegates to pty.write', () => {
    const { id } = createSession('/tmp/test', mockWindow)

    writeToSession(id, 'test input')

    expect(currentMockPty.write).toHaveBeenCalledWith('test input')
  })

  it('no-ops for unknown session', () => {
    expect(() => writeToSession('nonexistent', 'data')).not.toThrow()
  })
})

describe('resizeSession', () => {
  it('delegates to pty.resize', () => {
    const { id } = createSession('/tmp/test', mockWindow)

    resizeSession(id, 120, 40)

    expect(currentMockPty.resize).toHaveBeenCalledWith(120, 40)
  })

  it('no-ops for unknown session', () => {
    expect(() => resizeSession('nonexistent', 80, 24)).not.toThrow()
  })
})

// ─── listSessions ─────────────────────────────────────────────────────

describe('listSessions', () => {
  it('returns all active sessions', () => {
    const s1 = createSession('/tmp/a', mockWindow)
    // Reset mock to provide fresh pty for second session
    currentMockPty = createMockPty()
    vi.mocked(nodePty.spawn).mockReturnValue(currentMockPty as unknown as nodePty.IPty)
    const s2 = createSession('/tmp/b', mockWindow)

    const sessions = listSessions()

    expect(sessions).toHaveLength(2)
    expect(sessions.map((s) => s.id)).toContain(s1.id)
    expect(sessions.map((s) => s.id)).toContain(s2.id)
    expect(sessions[0]).toMatchObject({
      cwd: expect.any(String),
      claudeSessionId: expect.any(String),
      alive: true
    })
  })

  it('returns empty array when no sessions', () => {
    expect(listSessions()).toEqual([])
  })
})

// ─── getSessionScrollback ─────────────────────────────────────────────

describe('getSessionScrollback', () => {
  it('returns scrollback data after pty output', () => {
    const { id } = createSession('/tmp/test', mockWindow)

    // Simulate some pty output
    currentMockPty._dataCb!('line 1\n')
    currentMockPty._dataCb!('line 2\n')

    const scrollback = getSessionScrollback(id)

    expect(scrollback).toContain('line 1')
    expect(scrollback).toContain('line 2')
  })

  it('returns empty string for unknown session', () => {
    expect(getSessionScrollback('nonexistent')).toBe('')
  })
})

// ─── getSessionChanges ────────────────────────────────────────────────

describe('getSessionChanges', () => {
  it('returns empty array for unknown session', () => {
    expect(getSessionChanges('nonexistent')).toEqual([])
  })
})

// ─── killSession (with real sessions) ─────────────────────────────────

describe('killSession (lifecycle)', () => {
  it('kills pty, closes watcher, and removes from sessions map', () => {
    const { id } = createSession('/tmp/test', mockWindow)
    const watcherClose = vi.mocked(createFileWatcher).mock.results[0].value.close

    killSession(id)

    expect(currentMockPty.kill).toHaveBeenCalled()
    expect(watcherClose).toHaveBeenCalled()
    expect(listSessions()).toEqual([])
  })

  it('double-kill does not throw', () => {
    const { id } = createSession('/tmp/test', mockWindow)

    killSession(id)
    expect(() => killSession(id)).not.toThrow()
  })
})

// ─── listEnvScripts ───────────────────────────────────────────────────

describe('listEnvScripts', () => {
  it('returns .sh files from .konductor directory', () => {
    mockReaddirSync.mockReturnValue(['envrc.sh', 'other.sh', 'readme.md'])

    const scripts = listEnvScripts('/project')

    expect(scripts).toHaveLength(2)
    expect(scripts[0]).toContain('envrc.sh')
    expect(scripts[1]).toContain('other.sh')
  })

  it('returns empty array when directory does not exist', () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    expect(listEnvScripts('/nonexistent')).toEqual([])
  })
})
