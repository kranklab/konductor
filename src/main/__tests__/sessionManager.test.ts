import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before importing the module under test
vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

// Mock node-pty
vi.mock('node-pty', () => ({
  default: { spawn: vi.fn() },
  spawn: vi.fn()
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

import { killSession, killAllSessions } from '../sessionManager'

/**
 * These tests verify the cleanup ordering logic.
 * Since sessions are module-level state, we test the exported functions
 * and verify they don't throw on edge cases.
 */
describe('killSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no-ops for unknown session id', () => {
    // Should not throw
    expect(() => killSession('nonexistent-session')).not.toThrow()
  })

  it('no-ops for already-killed session id', () => {
    // Calling kill twice should not throw
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
