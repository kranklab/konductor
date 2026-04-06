import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BrowserWindow } from 'electron'

// ─── Chokidar mock with callback capture ─────────────────────────────

type WatcherCb = (filePath: string) => void

interface MockWatcher {
  on: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  _callbacks: Record<string, WatcherCb>
}

function createMockWatcher(): MockWatcher {
  const w: MockWatcher = {
    on: vi.fn(),
    close: vi.fn(),
    _callbacks: {}
  }
  w.on.mockImplementation((event: string, cb: WatcherCb) => {
    w._callbacks[event] = cb
    return w
  })
  return w
}

let mockWatchers: MockWatcher[] = []

vi.mock('chokidar', () => ({
  watch: vi.fn(() => {
    const w = createMockWatcher()
    mockWatchers.push(w)
    return w
  })
}))

// ─── fs/promises mock ────────────────────────────────────────────────

const mockReadFile = vi.fn<(path: string, encoding: string) => Promise<string>>()
const mockMkdir = vi
  .fn<(path: string, opts: unknown) => Promise<void>>()
  .mockResolvedValue(undefined)
const mockUnlink = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined)

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(args[0] as string, args[1] as string),
  mkdir: (...args: unknown[]) => mockMkdir(args[0] as string, args[1]),
  unlink: (...args: unknown[]) => mockUnlink(args[0] as string)
}))

// ─── Mock electron ───────────────────────────────────────────────────

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

// ─── Mock sessionManager (for sessionStateDir) ──────────────────────

vi.mock('../sessionManager', () => ({
  sessionStateDir: '/tmp/test-konductor-state'
}))

// ─── Mock @electron-toolkit/utils ────────────────────────────────────

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

import { startActivityWatcher, stopActivityWatcher } from '../activityWatcher'

const mockWindow = {
  isDestroyed: vi.fn(() => false),
  webContents: { send: vi.fn() }
} as unknown as BrowserWindow

beforeEach(() => {
  vi.clearAllMocks()
  mockWatchers = []
  mockMkdir.mockResolvedValue(undefined)
  mockUnlink.mockResolvedValue(undefined)
})

afterEach(() => {
  stopActivityWatcher()
})

// Helper: start the watcher and flush the mkdir promises so chokidar watchers are created
async function startAndFlush(): Promise<void> {
  startActivityWatcher(mockWindow)
  // mkdir().then() creates the watchers — let microtasks resolve
  await vi.waitFor(() => {
    expect(mockWatchers.length).toBe(2)
  })
}

// ─── Activity state files ────────────────────────────────────────────

describe('activity state handling', () => {
  it('sends session-activity IPC when a state file is added', async () => {
    await startAndFlush()
    const activityWatcher = mockWatchers[0]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        state: 'working',
        tool: 'Edit',
        summary: 'Fixing a bug',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )

    await activityWatcher._callbacks['add']('/tmp/test-konductor-state/abc-123.json')

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('session-activity', {
      claudeSessionId: 'abc-123',
      state: 'working',
      tool: 'Edit',
      summary: 'Fixing a bug',
      timestamp: '2026-01-01T00:00:00Z'
    })
  })

  it('ignores non-json files', async () => {
    await startAndFlush()
    const activityWatcher = mockWatchers[0]

    await activityWatcher._callbacks['add']('/tmp/test-konductor-state/file.txt')

    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('does not send IPC when window is destroyed', async () => {
    ;(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true)
    await startAndFlush()
    const activityWatcher = mockWatchers[0]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ state: 'waiting', tool: '', summary: '', timestamp: '' })
    )

    await activityWatcher._callbacks['add']('/tmp/test-konductor-state/session.json')

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('silently ignores malformed JSON', async () => {
    await startAndFlush()
    const activityWatcher = mockWatchers[0]

    mockReadFile.mockResolvedValueOnce('not json{{{')

    await expect(
      activityWatcher._callbacks['add']('/tmp/test-konductor-state/bad.json')
    ).resolves.toBeUndefined()

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
  })
})

// ─── Session request files ───────────────────────────────────────────

describe('session request handling', () => {
  it('sends session-request IPC when a request file appears', async () => {
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        id: 'req-1',
        type: 'start_session',
        cwd: '/home/user/project',
        plan: 'Fix the login page',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )

    await requestWatcher._callbacks['add']('/tmp/test-konductor-state/session-requests/req-1.json')

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('session-request', {
      cwd: '/home/user/project',
      plan: 'Fix the login page',
      branch: undefined
    })
  })

  it('includes branch when provided', async () => {
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        id: 'req-2',
        type: 'start_session',
        cwd: '/home/user/project',
        plan: 'Add dark mode',
        branch: 'feature/dark-mode',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )

    await requestWatcher._callbacks['add']('/tmp/test-konductor-state/session-requests/req-2.json')

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('session-request', {
      cwd: '/home/user/project',
      plan: 'Add dark mode',
      branch: 'feature/dark-mode'
    })
  })

  it('cleans up the request file after processing', async () => {
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    const filePath = '/tmp/test-konductor-state/session-requests/req-3.json'
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        id: 'req-3',
        type: 'start_session',
        cwd: '/project',
        plan: 'Test plan',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )

    await requestWatcher._callbacks['add'](filePath)

    expect(mockUnlink).toHaveBeenCalledWith(filePath)
  })

  it('ignores request with missing cwd', async () => {
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        id: 'req-bad',
        type: 'start_session',
        cwd: '',
        plan: 'Some plan',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )

    await requestWatcher._callbacks['add'](
      '/tmp/test-konductor-state/session-requests/req-bad.json'
    )

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('ignores request with missing plan', async () => {
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        id: 'req-bad',
        type: 'start_session',
        cwd: '/project',
        plan: '',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )

    await requestWatcher._callbacks['add'](
      '/tmp/test-konductor-state/session-requests/req-bad.json'
    )

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('ignores request with wrong type', async () => {
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        id: 'req-wrong',
        type: 'unknown_type',
        cwd: '/project',
        plan: 'Plan',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )

    await requestWatcher._callbacks['add'](
      '/tmp/test-konductor-state/session-requests/req-wrong.json'
    )

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('ignores non-json files in request dir', async () => {
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    await requestWatcher._callbacks['add']('/tmp/test-konductor-state/session-requests/readme.txt')

    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('does not send IPC when window is destroyed', async () => {
    ;(mockWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true)
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        id: 'req-dead',
        type: 'start_session',
        cwd: '/project',
        plan: 'Plan',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )

    await requestWatcher._callbacks['add'](
      '/tmp/test-konductor-state/session-requests/req-dead.json'
    )

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('still cleans up the file even when unlink fails', async () => {
    await startAndFlush()
    const requestWatcher = mockWatchers[1]

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        id: 'req-4',
        type: 'start_session',
        cwd: '/project',
        plan: 'Plan',
        timestamp: '2026-01-01T00:00:00Z'
      })
    )
    mockUnlink.mockRejectedValueOnce(new Error('EPERM'))

    // Should not throw
    await expect(
      requestWatcher._callbacks['add']('/tmp/test-konductor-state/session-requests/req-4.json')
    ).resolves.toBeUndefined()

    expect(mockWindow.webContents.send).toHaveBeenCalled()
  })
})

// ─── stopActivityWatcher ─────────────────────────────────────────────

describe('stopActivityWatcher', () => {
  it('closes both watchers', async () => {
    await startAndFlush()

    expect(mockWatchers).toHaveLength(2)

    stopActivityWatcher()

    expect(mockWatchers[0].close).toHaveBeenCalled()
    expect(mockWatchers[1].close).toHaveBeenCalled()
  })

  it('no-ops when called without starting', () => {
    expect(() => stopActivityWatcher()).not.toThrow()
  })
})
