import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn()
}))

import { execFile } from 'child_process'
import {
  getGitHubRepo,
  listPullRequests,
  listIssues,
  getPrDetail,
  getCheckRunLogs
} from '../github'

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

// ─── getPrDetail ─────────────────────────────────────────────────────

describe('getPrDetail', () => {
  it('parses full PR detail with comments, reviews, and checks', async () => {
    // 1st call: getGitHubRepo
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    // 2nd call: gh pr view
    mockExecFileOnce(
      null,
      JSON.stringify({
        number: 42,
        title: 'Add feature',
        state: 'OPEN',
        author: { login: 'alice' },
        body: '## Summary\nThis adds a feature.',
        headRefName: 'feat/new',
        baseRefName: 'main',
        additions: 100,
        deletions: 20,
        commits: { totalCount: 3 },
        labels: [{ name: 'enhancement' }],
        statusCheckRollup: [
          {
            name: 'build',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            detailsUrl: 'https://github.com/owner/repo/actions/runs/123/job/456'
          },
          {
            name: 'test',
            status: 'COMPLETED',
            conclusion: 'FAILURE',
            detailsUrl: 'https://github.com/owner/repo/actions/runs/123/job/789'
          }
        ],
        url: 'https://github.com/owner/repo/pull/42',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
        comments: [
          { author: { login: 'bob' }, body: 'Looks good!', createdAt: '2025-01-01T12:00:00Z' }
        ],
        reviews: [
          { author: { login: 'charlie' }, body: 'LGTM', submittedAt: '2025-01-01T13:00:00Z' },
          { author: { login: 'dave' }, body: '', createdAt: '2025-01-01T14:00:00Z' }
        ]
      })
    )

    const detail = await getPrDetail('/tmp', 42)

    expect(detail).not.toBeNull()
    expect(detail!.number).toBe(42)
    expect(detail!.title).toBe('Add feature')
    expect(detail!.state).toBe('open')
    expect(detail!.author).toBe('alice')
    expect(detail!.body).toBe('## Summary\nThis adds a feature.')
    expect(detail!.branch).toBe('feat/new')
    expect(detail!.baseBranch).toBe('main')
    expect(detail!.additions).toBe(100)
    expect(detail!.deletions).toBe(20)
    expect(detail!.commits).toBe(3)
    expect(detail!.labels).toEqual(['enhancement'])

    // Comments: 2 total (1 issue comment + 1 review with body, review without body is skipped)
    expect(detail!.comments).toHaveLength(2)
    expect(detail!.comments[0].author).toBe('bob')
    expect(detail!.comments[1].author).toBe('charlie')

    // Checks
    expect(detail!.checks).toHaveLength(2)
    expect(detail!.checks[0]).toEqual({
      name: 'build',
      status: 'completed',
      conclusion: 'success',
      url: 'https://github.com/owner/repo/actions/runs/123/job/456'
    })
    expect(detail!.checks[1].conclusion).toBe('failure')
  })

  it('returns null when not a GitHub repo', async () => {
    mockExecFileOnce(null, 'https://gitlab.com/foo/bar.git\n')

    const detail = await getPrDetail('/tmp', 1)

    expect(detail).toBeNull()
  })

  it('returns null when gh command fails', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    mockExecFileOnce(new Error('not found'), '')

    const detail = await getPrDetail('/tmp', 999)

    expect(detail).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    mockExecFileOnce(null, 'not json{{{')

    const detail = await getPrDetail('/tmp', 1)

    expect(detail).toBeNull()
  })

  it('handles merged state', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    mockExecFileOnce(
      null,
      JSON.stringify({
        number: 10,
        state: 'MERGED',
        author: { login: 'alice' },
        comments: [],
        reviews: [],
        statusCheckRollup: []
      })
    )

    const detail = await getPrDetail('/tmp', 10)

    expect(detail!.state).toBe('merged')
  })

  it('handles missing fields gracefully', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    mockExecFileOnce(
      null,
      JSON.stringify({
        number: 1,
        state: 'OPEN',
        author: null,
        body: null,
        comments: null,
        reviews: null,
        statusCheckRollup: null,
        labels: null,
        commits: null
      })
    )

    const detail = await getPrDetail('/tmp', 1)

    expect(detail).not.toBeNull()
    expect(detail!.author).toBe('')
    expect(detail!.body).toBe('')
    expect(detail!.comments).toEqual([])
    expect(detail!.checks).toEqual([])
    expect(detail!.labels).toEqual([])
    expect(detail!.commits).toBe(0)
  })

  it('sorts comments chronologically', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    mockExecFileOnce(
      null,
      JSON.stringify({
        number: 1,
        state: 'OPEN',
        author: { login: 'x' },
        comments: [
          { author: { login: 'late' }, body: 'second', createdAt: '2025-01-02T00:00:00Z' },
          { author: { login: 'early' }, body: 'first', createdAt: '2025-01-01T00:00:00Z' }
        ],
        reviews: [],
        statusCheckRollup: []
      })
    )

    const detail = await getPrDetail('/tmp', 1)

    expect(detail!.comments[0].author).toBe('early')
    expect(detail!.comments[1].author).toBe('late')
  })
})

// ─── getCheckRunLogs ─────────────────────────────────────────────────

describe('getCheckRunLogs', () => {
  it('fetches logs using run ID from actions URL', async () => {
    // 1st call: getGitHubRepo
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    // 2nd call: gh run view --log-failed
    mockExecFileOnce(null, 'Error: test failed\nassert false')

    const logs = await getCheckRunLogs(
      '/tmp',
      'https://github.com/owner/repo/actions/runs/12345/job/67890'
    )

    expect(logs).toBe('Error: test failed\nassert false')
    expect(mockedExecFile).toHaveBeenCalledWith(
      'gh',
      ['run', 'view', '12345', '--repo', 'owner/repo', '--log-failed'],
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('falls back to --log when --log-failed fails', async () => {
    // 1st call: getGitHubRepo
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    // 2nd call: gh run view --log-failed fails
    mockExecFileOnce(new Error('no failed jobs'), '')
    // 3rd call: gh run view --log
    mockExecFileOnce(null, 'full log output here')

    const logs = await getCheckRunLogs(
      '/tmp',
      'https://github.com/owner/repo/actions/runs/999/job/111'
    )

    expect(logs).toBe('full log output here')
  })

  it('returns error message when run ID cannot be extracted', async () => {
    const logs = await getCheckRunLogs('/tmp', 'https://example.com/something-else')

    expect(logs).toContain('Could not extract run ID')
  })

  it('returns error when not a GitHub repo', async () => {
    mockExecFileOnce(null, 'https://gitlab.com/foo/bar.git\n')

    const logs = await getCheckRunLogs(
      '/tmp',
      'https://github.com/owner/repo/actions/runs/123/job/456'
    )

    expect(logs).toContain('Could not determine GitHub repository')
  })

  it('truncates very long logs', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    // Generate 600 lines of output
    const longOutput = Array.from({ length: 600 }, (_, i) => `line ${i}`).join('\n')
    mockExecFileOnce(null, longOutput)

    const logs = await getCheckRunLogs(
      '/tmp',
      'https://github.com/owner/repo/actions/runs/123/job/456'
    )

    expect(logs).toContain('truncated')
    // Should contain the last 500 lines
    expect(logs).toContain('line 599')
    expect(logs).not.toContain('line 0\n')
  })

  it('parses legacy /runs/ URL format', async () => {
    mockExecFileOnce(null, 'git@github.com:owner/repo.git\n')
    mockExecFileOnce(null, 'some logs')

    const logs = await getCheckRunLogs('/tmp', 'https://github.com/owner/repo/runs/54321')

    expect(logs).toBe('some logs')
    expect(mockedExecFile).toHaveBeenCalledWith(
      'gh',
      ['run', 'view', '54321', '--repo', 'owner/repo', '--log-failed'],
      expect.any(Object),
      expect.any(Function)
    )
  })
})
