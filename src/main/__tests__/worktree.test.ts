import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn()
}))

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined)
}))

import { execFile } from 'child_process'
import {
  parseBranchLine,
  listWorktrees,
  listBranches,
  getBranchFiles,
  batchGetPrStatuses
} from '../worktree'

const mockedExecFile = vi.mocked(execFile)

beforeEach(() => {
  vi.clearAllMocks()
})

/** Helper: make execFile call the callback with (err, stdout) on next invocation. */
function mockExecFileOnce(err: Error | null, stdout: string): void {
  mockedExecFile.mockImplementationOnce(((
    _cmd: string,
    _args: unknown,
    _opts: unknown,
    cb: (...args: unknown[]) => void
  ) => {
    cb(err, stdout)
  }) as unknown as typeof execFile)
}

// ─── parseBranchLine ──────────────────────────────────────────────────

describe('parseBranchLine', () => {
  it('parses a normal branch line', () => {
    const line = [
      'feature/login',
      '*',
      'origin/feature/login',
      '[ahead 2]',
      '2025-01-15 10:30:00 +0000',
      '3 days ago',
      'Add login form'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).toEqual({
      name: 'feature/login',
      head: '*',
      upstream: 'origin/feature/login',
      track: '[ahead 2]',
      date: '2025-01-15 10:30:00 +0000',
      relative: '3 days ago',
      subject: 'Add login form'
    })
  })

  it('handles subject with double quotes', () => {
    const line = [
      'main',
      ' ',
      'origin/main',
      '',
      '2025-01-15 10:30:00 +0000',
      '1 day ago',
      'Fix "broken" parser'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).not.toBeNull()
    expect(result!.subject).toBe('Fix "broken" parser')
  })

  it('handles subject with backslashes', () => {
    const line = [
      'fix/paths',
      ' ',
      '',
      '',
      '2025-01-15 10:30:00 +0000',
      '2 hours ago',
      'Fix C:\\Users\\path issue'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).not.toBeNull()
    expect(result!.subject).toBe('Fix C:\\Users\\path issue')
  })

  it('returns null for malformed line (wrong number of fields)', () => {
    expect(parseBranchLine('only\0two')).toBeNull()
    expect(parseBranchLine('')).toBeNull()
    expect(parseBranchLine('a\0b\0c\0d\0e\0f\0g\0extra')).toBeNull()
  })

  it('handles empty fields', () => {
    const line = [
      'develop',
      ' ',
      '',
      '',
      '2025-01-15 10:30:00 +0000',
      '5 minutes ago',
      'Initial commit'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).not.toBeNull()
    expect(result!.upstream).toBe('')
    expect(result!.track).toBe('')
  })

  it('handles subject with newline-like content', () => {
    const line = [
      'feature/x',
      ' ',
      '',
      '',
      '2025-01-15 10:30:00 +0000',
      '1 day ago',
      'Subject with {braces} and [brackets]'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).not.toBeNull()
    expect(result!.subject).toBe('Subject with {braces} and [brackets]')
  })
})

// ─── listWorktrees ────────────────────────────────────────────────────

describe('listWorktrees', () => {
  it('parses porcelain output with main and feature branches', async () => {
    const porcelain = [
      'worktree /home/user/project',
      'HEAD abc1234',
      'branch refs/heads/main',
      '',
      'worktree /home/user/project/.konductor/worktrees/feature-x',
      'HEAD def5678',
      'branch refs/heads/feature-x',
      ''
    ].join('\n')

    mockExecFileOnce(null, porcelain)

    const worktrees = await listWorktrees('/home/user/project')

    expect(worktrees).toHaveLength(2)
    expect(worktrees[0]).toEqual({
      path: '/home/user/project',
      branch: 'main',
      isMain: true
    })
    expect(worktrees[1]).toEqual({
      path: '/home/user/project/.konductor/worktrees/feature-x',
      branch: 'feature-x',
      isMain: false
    })
  })

  it('handles detached HEAD', async () => {
    const porcelain = [
      'worktree /home/user/project',
      'HEAD abc1234',
      'branch refs/heads/main',
      '',
      'worktree /home/user/project/.konductor/worktrees/temp',
      'HEAD 9999999',
      'detached',
      ''
    ].join('\n')

    mockExecFileOnce(null, porcelain)

    const worktrees = await listWorktrees('/home/user/project')

    expect(worktrees).toHaveLength(2)
    expect(worktrees[1].branch).toBe('(detached)')
    expect(worktrees[1].isMain).toBe(false)
  })

  it('marks first entry as isMain', async () => {
    mockExecFileOnce(null, 'worktree /repo\nHEAD abc\nbranch refs/heads/develop\n')

    const worktrees = await listWorktrees('/repo')

    expect(worktrees[0].isMain).toBe(true)
  })

  it('rejects on git error', async () => {
    mockExecFileOnce(new Error('not a git repository'), '')

    await expect(listWorktrees('/not-a-repo')).rejects.toThrow('not a git repository')
  })
})

// ─── listBranches ─────────────────────────────────────────────────────

describe('listBranches', () => {
  it('parses branch names', async () => {
    mockExecFileOnce(null, 'main\nfeature/login\nfix/bug\n')

    const branches = await listBranches('/repo')

    expect(branches).toEqual(['main', 'feature/login', 'fix/bug'])
  })

  it('filters empty lines', async () => {
    mockExecFileOnce(null, 'main\n\nfeature\n')

    const branches = await listBranches('/repo')

    expect(branches).toEqual(['main', 'feature'])
  })
})

// ─── getBranchFiles ───────────────────────────────────────────────────

describe('getBranchFiles', () => {
  it('separates committed and uncommitted files', async () => {
    // 1st call: getDefaultBranch → git symbolic-ref
    mockExecFileOnce(null, 'refs/remotes/origin/main')
    // 2nd call: git diff --name-status (committed changes) — gitSafe, raw output
    mockExecFileOnce(null, 'M\tsrc/app.ts\nA\tsrc/new.ts\n')
    // 3rd call: git status --porcelain (uncommitted changes) — gitSafe, raw output
    // Porcelain format: XY PATH where XY is 2 chars, then space, then path
    mockExecFileOnce(null, ' M src/local.ts\n?? untitled.ts\n')

    const files = await getBranchFiles('/repo', 'feature', '/repo/.konductor/worktrees/feature')

    const committed = files.filter((f) => f.source === 'committed')
    const uncommitted = files.filter((f) => f.source === 'uncommitted')

    expect(committed).toHaveLength(2)
    expect(committed[0]).toMatchObject({ path: 'src/app.ts', status: 'M' })
    expect(committed[1]).toMatchObject({ path: 'src/new.ts', status: 'A' })

    expect(uncommitted).toHaveLength(2)
    expect(uncommitted[0]).toMatchObject({ path: 'src/local.ts', status: 'M' })
    expect(uncommitted[1]).toMatchObject({ path: 'untitled.ts', status: 'A' })
  })

  it('handles renames in committed changes', async () => {
    mockExecFileOnce(null, 'refs/remotes/origin/main')
    mockExecFileOnce(null, 'R100\told/path.ts\tnew/path.ts\n')
    mockExecFileOnce(null, '')

    const files = await getBranchFiles('/repo', 'feature', '/repo/wt')

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ path: 'new/path.ts', status: 'R', source: 'committed' })
  })

  it('returns empty array on all errors', async () => {
    mockExecFileOnce(new Error('fail'), '') // getDefaultBranch fails → fallback to 'main'
    mockExecFileOnce(new Error('fail'), '') // git diff fails → empty (gitSafe)
    mockExecFileOnce(new Error('fail'), '') // git status fails → empty (gitSafe)

    const files = await getBranchFiles('/repo', 'feature', '/repo/wt')

    expect(files).toEqual([])
  })

  it('skips uncommitted when no worktreePath', async () => {
    mockExecFileOnce(null, 'refs/remotes/origin/main')
    mockExecFileOnce(null, 'A\tnew.ts\n')

    const files = await getBranchFiles('/repo', 'feature', '')

    expect(files).toHaveLength(1)
    expect(files[0].source).toBe('committed')
  })
})

// ─── batchGetPrStatuses ───────────────────────────────────────────────

describe('batchGetPrStatuses', () => {
  it('parses gh JSON and indexes by branch name', async () => {
    mockExecFileOnce(
      null,
      JSON.stringify([
        { headRefName: 'feature-a', state: 'OPEN', number: 1, url: 'https://example.com/pr/1' },
        { headRefName: 'feature-b', state: 'MERGED', number: 2, url: 'https://example.com/pr/2' },
        { headRefName: 'feature-c', state: 'CLOSED', number: 3, url: 'https://example.com/pr/3' }
      ])
    )

    const result = await batchGetPrStatuses('/repo')

    expect(result.size).toBe(3)
    expect(result.get('feature-a')).toEqual({
      state: 'open',
      number: 1,
      url: 'https://example.com/pr/1'
    })
    expect(result.get('feature-b')?.state).toBe('merged')
    expect(result.get('feature-c')?.state).toBe('closed')
  })

  it('returns empty map when gh fails', async () => {
    mockExecFileOnce(new Error('gh not found'), '')

    const result = await batchGetPrStatuses('/repo')

    expect(result.size).toBe(0)
  })

  it('keeps first PR per branch (most recent)', async () => {
    mockExecFileOnce(
      null,
      JSON.stringify([
        { headRefName: 'feature', state: 'OPEN', number: 10, url: 'https://example.com/pr/10' },
        { headRefName: 'feature', state: 'CLOSED', number: 5, url: 'https://example.com/pr/5' }
      ])
    )

    const result = await batchGetPrStatuses('/repo')

    expect(result.size).toBe(1)
    expect(result.get('feature')?.number).toBe(10)
  })

  it('handles malformed JSON', async () => {
    mockExecFileOnce(null, 'not json{{{')

    const result = await batchGetPrStatuses('/repo')

    expect(result.size).toBe(0)
  })

  it('skips entries without headRefName', async () => {
    mockExecFileOnce(
      null,
      JSON.stringify([
        { headRefName: '', state: 'OPEN', number: 1, url: 'url' },
        { headRefName: 'valid', state: 'OPEN', number: 2, url: 'url2' }
      ])
    )

    const result = await batchGetPrStatuses('/repo')

    expect(result.size).toBe(1)
    expect(result.has('valid')).toBe(true)
  })
})
