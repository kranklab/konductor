import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn()
}))

import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { loadState, saveState, type PersistedState } from '../store'

const mockedReadFile = vi.mocked(readFile)
const mockedWriteFile = vi.mocked(writeFile)
const mockedRename = vi.mocked(rename)
const mockedMkdir = vi.mocked(mkdir)

beforeEach(() => {
  vi.clearAllMocks()
  mockedWriteFile.mockResolvedValue(undefined)
  mockedRename.mockResolvedValue(undefined)
  mockedMkdir.mockResolvedValue(undefined)
})

describe('loadState', () => {
  it('returns default state when file does not exist', async () => {
    mockedReadFile.mockRejectedValue(new Error('ENOENT'))

    const state = await loadState()

    expect(state).toEqual({
      projects: [],
      activeProjectId: null,
      nextProjectId: 1,
      sessions: [],
      activeSessionIndex: null,
      gridCols: 2
    })
  })

  it('parses valid JSON and fills all fields', async () => {
    const stored: PersistedState = {
      projects: [{ id: 'project-1', name: 'test', cwd: '/tmp/test' }],
      activeProjectId: 'project-1',
      nextProjectId: 2,
      sessions: [
        {
          projectId: 'project-1',
          cwd: '/tmp/test',
          title: 'Session 1',
          summary: 'testing',
          claudeSessionId: 'abc-123'
        }
      ],
      activeSessionIndex: 0,
      gridCols: 1
    }
    mockedReadFile.mockResolvedValue(JSON.stringify(stored))

    const state = await loadState()

    expect(state.projects).toHaveLength(1)
    expect(state.projects[0].name).toBe('test')
    expect(state.activeProjectId).toBe('project-1')
    expect(state.nextProjectId).toBe(2)
    expect(state.sessions).toHaveLength(1)
    expect(state.activeSessionIndex).toBe(0)
    expect(state.gridCols).toBe(1)
  })

  it('handles partial JSON with missing fields', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ projects: [] }))

    const state = await loadState()

    expect(state.projects).toEqual([])
    expect(state.activeProjectId).toBeNull()
    expect(state.nextProjectId).toBe(1)
    expect(state.sessions).toEqual([])
    expect(state.activeSessionIndex).toBeNull()
    expect(state.gridCols).toBe(2)
  })

  it('coerces invalid gridCols to 2', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ gridCols: 3 }))

    const state = await loadState()

    expect(state.gridCols).toBe(2)
  })

  it('handles malformed JSON gracefully', async () => {
    mockedReadFile.mockResolvedValue('not valid json {{{')

    const state = await loadState()

    expect(state.projects).toEqual([])
    expect(state.activeProjectId).toBeNull()
  })

  it('handles non-array projects field', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ projects: 'invalid' }))

    const state = await loadState()

    expect(state.projects).toEqual([])
  })

  it('preserves pr field on sessions', async () => {
    const stored: PersistedState = {
      projects: [],
      activeProjectId: null,
      nextProjectId: 1,
      sessions: [
        {
          projectId: 'project-1',
          cwd: '/tmp/test',
          title: 'feature-x',
          summary: '',
          claudeSessionId: 'abc-123',
          pr: { state: 'open', number: 42, url: 'https://github.com/org/repo/pull/42' }
        }
      ],
      activeSessionIndex: 0,
      gridCols: 2
    }
    mockedReadFile.mockResolvedValue(JSON.stringify(stored))

    const state = await loadState()

    expect(state.sessions[0].pr).toEqual({
      state: 'open',
      number: 42,
      url: 'https://github.com/org/repo/pull/42'
    })
  })
})

describe('saveState', () => {
  it('creates directory with recursive option', async () => {
    const state: PersistedState = {
      projects: [],
      activeProjectId: null,
      nextProjectId: 1,
      sessions: [],
      activeSessionIndex: null,
      gridCols: 2
    }

    await saveState(state)

    expect(mockedMkdir).toHaveBeenCalledWith(expect.stringContaining('.konductor'), {
      recursive: true
    })
  })

  it('writes atomically via tmp file then rename', async () => {
    const state: PersistedState = {
      projects: [],
      activeProjectId: null,
      nextProjectId: 1,
      sessions: [],
      activeSessionIndex: null,
      gridCols: 2
    }

    await saveState(state)

    // Should write to .tmp file first
    expect(mockedWriteFile).toHaveBeenCalledTimes(1)
    const writtenPath = mockedWriteFile.mock.calls[0][0] as string
    expect(writtenPath).toMatch(/\.tmp$/)

    // Then rename to final path
    expect(mockedRename).toHaveBeenCalledTimes(1)
    const [tmpPath, finalPath] = mockedRename.mock.calls[0] as [string, string]
    expect(tmpPath).toMatch(/\.tmp$/)
    expect(finalPath).toMatch(/state\.json$/)
  })

  it('writes correctly formatted JSON', async () => {
    const state: PersistedState = {
      projects: [{ id: 'p-1', name: 'test', cwd: '/tmp' }],
      activeProjectId: 'p-1',
      nextProjectId: 2,
      sessions: [],
      activeSessionIndex: null,
      gridCols: 1
    }

    await saveState(state)

    const writtenContent = mockedWriteFile.mock.calls[0][1] as string
    const parsed = JSON.parse(writtenContent)
    expect(parsed.projects[0].name).toBe('test')
    expect(parsed.activeProjectId).toBe('p-1')
    expect(parsed.gridCols).toBe(1)
  })
})
