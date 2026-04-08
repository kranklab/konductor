import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn()
}))

import { execFile } from 'child_process'
import { getGitHubRepo, listPullRequests, listIssues } from '../github'

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

describe('getGitHubRepo', () => {
  it('parses SSH URL', async () => {
    mockExecFileOnce(null, 'git@github.com:kranklab/conductor.git\n')

    const repo = await getGitHubRepo('/tmp')

    expect(repo).toEqual({ owner: 'kranklab', repo: 'conductor' })
  })

  it('parses HTTPS URL', async () => {
    mockExecFileOnce(null, 'https://github.com/kranklab/conductor.git\n')

    const repo = await getGitHubRepo('/tmp')

    expect(repo).toEqual({ owner: 'kranklab', repo: 'conductor' })
  })

  it('parses HTTPS URL without .git suffix', async () => {
    mockExecFileOnce(null, 'https://github.com/owner/repo\n')

    const repo = await getGitHubRepo('/tmp')

    expect(repo).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('returns null for non-GitHub remote', async () => {
    mockExecFileOnce(null, 'https://gitlab.com/foo/bar.git\n')

    const repo = await getGitHubRepo('/tmp')

    expect(repo).toBeNull()
  })

  it('returns null when git command fails', async () => {
    mockExecFileOnce(new Error('not a git repo'), '')

    const repo = await getGitHubRepo('/tmp')

    expect(repo).toBeNull()
  })
})

describe('listPullRequests', () => {
  it('maps gh JSON to GitHubPR array with correct state normalization', async () => {
    // First call: getGitHubRepo (git remote get-url origin)
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    // Second call: gh pr list
    mockExecFileOnce(
      null,
      JSON.stringify([
        {
          number: 42,
          title: 'Fix bug',
          state: 'MERGED',
          author: { login: 'alice' },
          headRefName: 'fix/bug',
          labels: [{ name: 'bugfix' }],
          statusCheckRollup: [{ conclusion: 'SUCCESS' }],
          url: 'https://github.com/owner/repo/pull/42',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z'
        },
        {
          number: 43,
          title: 'Add feature',
          state: 'OPEN',
          author: { login: 'bob' },
          headRefName: 'feat/new',
          labels: [],
          statusCheckRollup: [],
          url: 'https://github.com/owner/repo/pull/43',
          createdAt: '2025-01-03T00:00:00Z',
          updatedAt: '2025-01-04T00:00:00Z'
        },
        {
          number: 44,
          title: 'Old PR',
          state: 'CLOSED',
          author: { login: 'charlie' },
          headRefName: 'old/branch',
          labels: [],
          statusCheckRollup: [{ conclusion: 'FAILURE' }],
          url: 'https://github.com/owner/repo/pull/44',
          createdAt: '2025-01-05T00:00:00Z',
          updatedAt: '2025-01-06T00:00:00Z'
        }
      ])
    )

    const prs = await listPullRequests('/tmp', 'all')

    expect(prs).toHaveLength(3)
    expect(prs[0].state).toBe('merged')
    expect(prs[0].author).toBe('alice')
    expect(prs[0].branch).toBe('fix/bug')
    expect(prs[0].labels).toEqual(['bugfix'])
    expect(prs[0].statusCheck).toBe('success')

    expect(prs[1].state).toBe('open')
    expect(prs[1].statusCheck).toBe('')

    expect(prs[2].state).toBe('closed')
    expect(prs[2].statusCheck).toBe('failure')
  })

  it('returns empty array when not a GitHub repo', async () => {
    mockExecFileOnce(null, 'https://gitlab.com/foo/bar.git\n')

    const prs = await listPullRequests('/tmp', 'open')

    expect(prs).toEqual([])
  })

  it('returns empty array when gh CLI fails', async () => {
    // First call: getGitHubRepo succeeds
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    // Second call: gh CLI fails
    mockExecFileOnce(new Error('ENOENT'), '')

    await expect(listPullRequests('/tmp', 'open')).rejects.toThrow()
  })

  it('handles missing author gracefully', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    mockExecFileOnce(
      null,
      JSON.stringify([
        {
          number: 1,
          title: 'Test',
          state: 'OPEN',
          author: null,
          headRefName: 'test',
          labels: [],
          statusCheckRollup: [],
          url: 'https://github.com/owner/repo/pull/1',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z'
        }
      ])
    )

    const prs = await listPullRequests('/tmp', 'open')

    expect(prs[0].author).toBe('')
  })
})

describe('listIssues', () => {
  it('maps gh JSON to GitHubIssue array correctly', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    mockExecFileOnce(
      null,
      JSON.stringify([
        {
          number: 10,
          title: 'Bug report',
          body: 'Something is broken',
          state: 'OPEN',
          author: { login: 'alice' },
          labels: [{ name: 'bug' }, { name: 'critical' }],
          assignees: [{ login: 'bob' }],
          url: 'https://github.com/owner/repo/issues/10',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z'
        },
        {
          number: 11,
          title: 'Done issue',
          body: '',
          state: 'CLOSED',
          author: { login: 'charlie' },
          labels: [],
          assignees: [],
          url: 'https://github.com/owner/repo/issues/11',
          createdAt: '2025-01-03T00:00:00Z',
          updatedAt: '2025-01-04T00:00:00Z'
        }
      ])
    )

    const issues = await listIssues('/tmp', 'all')

    expect(issues).toHaveLength(2)
    expect(issues[0].state).toBe('open')
    expect(issues[0].body).toBe('Something is broken')
    expect(issues[0].labels).toEqual(['bug', 'critical'])
    expect(issues[0].assignees).toEqual(['bob'])
    expect(issues[1].state).toBe('closed')
    expect(issues[1].body).toBe('')
    expect(issues[1].assignees).toEqual([])
  })

  it('returns empty array when not a GitHub repo', async () => {
    mockExecFileOnce(new Error('not a git repo'), '')

    const issues = await listIssues('/tmp', 'open')

    expect(issues).toEqual([])
  })
})
