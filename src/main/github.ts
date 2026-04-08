import { execFile } from 'child_process'
import { log } from './logger'
import type {
  GitHubRepo,
  GitHubPR,
  GitHubIssue,
  PrDetail,
  PrComment,
  PrCheckRun
} from '../shared/types'

export type { GitHubRepo, GitHubPR, GitHubIssue, PrDetail }

export function getGitHubRepo(cwd: string): Promise<GitHubRepo | null> {
  return new Promise((resolve) => {
    execFile('git', ['remote', 'get-url', 'origin'], { cwd }, (err, stdout) => {
      if (err) {
        log.warn('github', `Failed to get remote URL: ${(err as Error).message}`)
        resolve(null)
        return
      }
      const match = stdout.trim().match(/github\.com[:/]([^/]+)\/([^/.]+)/)
      if (!match) {
        resolve(null)
        return
      }
      resolve({ owner: match[1], repo: match[2] })
    })
  })
}

export async function listPullRequests(
  cwd: string,
  state: 'open' | 'closed' | 'merged' | 'all'
): Promise<GitHubPR[]> {
  const ghRepo = await getGitHubRepo(cwd)
  if (!ghRepo) return []

  const nwo = `${ghRepo.owner}/${ghRepo.repo}`
  const fields =
    'number,title,state,author,headRefName,labels,statusCheckRollup,url,createdAt,updatedAt'

  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      ['pr', 'list', '--repo', nwo, '--state', state, '--json', fields, '--limit', '100'],
      { cwd },
      (err, stdout) => {
        if (err) {
          log.warn('github', `gh pr list failed: ${(err as Error).message}`)
          reject(err)
          return
        }
        try {
          const raw = JSON.parse(stdout || '[]')
          const prs: GitHubPR[] = raw.map(
            (pr: {
              number: number
              title: string
              state: string
              author: { login: string }
              headRefName: string
              labels: { name: string }[]
              statusCheckRollup: { conclusion: string }[]
              url: string
              createdAt: string
              updatedAt: string
            }) => ({
              number: pr.number,
              title: pr.title,
              state: pr.state === 'MERGED' ? 'merged' : pr.state === 'CLOSED' ? 'closed' : 'open',
              author: pr.author?.login ?? '',
              branch: pr.headRefName ?? '',
              labels: (pr.labels ?? []).map((l) => l.name),
              statusCheck:
                pr.statusCheckRollup?.length > 0
                  ? (pr.statusCheckRollup[0].conclusion ?? 'pending').toLowerCase()
                  : '',
              url: pr.url,
              createdAt: pr.createdAt,
              updatedAt: pr.updatedAt
            })
          )
          resolve(prs)
        } catch {
          resolve([])
        }
      }
    )
  })
}

export async function listIssues(
  cwd: string,
  state: 'open' | 'closed' | 'all'
): Promise<GitHubIssue[]> {
  const ghRepo = await getGitHubRepo(cwd)
  if (!ghRepo) return []

  const nwo = `${ghRepo.owner}/${ghRepo.repo}`
  const fields = 'number,title,body,state,author,labels,assignees,url,createdAt,updatedAt'

  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      ['issue', 'list', '--repo', nwo, '--state', state, '--json', fields, '--limit', '100'],
      { cwd },
      (err, stdout) => {
        if (err) {
          log.warn('github', `gh issue list failed: ${(err as Error).message}`)
          reject(err)
          return
        }
        try {
          const raw = JSON.parse(stdout || '[]')
          const issues: GitHubIssue[] = raw.map(
            (issue: {
              number: number
              title: string
              body: string
              state: string
              author: { login: string }
              labels: { name: string }[]
              assignees: { login: string }[]
              url: string
              createdAt: string
              updatedAt: string
            }) => ({
              number: issue.number,
              title: issue.title,
              body: issue.body ?? '',
              state: issue.state === 'CLOSED' ? 'closed' : 'open',
              author: issue.author?.login ?? '',
              labels: (issue.labels ?? []).map((l) => l.name),
              assignees: (issue.assignees ?? []).map((a) => a.login),
              url: issue.url,
              createdAt: issue.createdAt,
              updatedAt: issue.updatedAt
            })
          )
          resolve(issues)
        } catch {
          resolve([])
        }
      }
    )
  })
}

export async function getPrDetail(cwd: string, prNumber: number): Promise<PrDetail | null> {
  const ghRepo = await getGitHubRepo(cwd)
  if (!ghRepo) return null

  const nwo = `${ghRepo.owner}/${ghRepo.repo}`
  const fields =
    'number,title,state,author,body,headRefName,baseRefName,additions,deletions,commits,labels,statusCheckRollup,url,createdAt,updatedAt,comments,reviews'

  return new Promise((resolve) => {
    execFile(
      'gh',
      ['pr', 'view', String(prNumber), '--repo', nwo, '--json', fields],
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          log.warn('github', `gh pr view failed: ${(err as Error).message}`)
          resolve(null)
          return
        }
        try {
          const pr = JSON.parse(stdout || '{}')

          // Collect comments from both issue comments and review comments
          const comments: PrComment[] = []

          // Issue-level comments
          if (Array.isArray(pr.comments)) {
            for (const c of pr.comments) {
              comments.push({
                author: c.author?.login ?? '',
                body: c.body ?? '',
                createdAt: c.createdAt ?? ''
              })
            }
          }

          // Review comments (with file/line context)
          if (Array.isArray(pr.reviews)) {
            for (const r of pr.reviews) {
              if (r.body) {
                comments.push({
                  author: r.author?.login ?? '',
                  body: r.body,
                  createdAt: r.submittedAt ?? r.createdAt ?? ''
                })
              }
            }
          }

          // Sort by date
          comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

          // Status checks
          const checks: PrCheckRun[] = Array.isArray(pr.statusCheckRollup)
            ? pr.statusCheckRollup.map(
                (c: { name: string; status: string; conclusion: string; detailsUrl: string }) => ({
                  name: c.name ?? '',
                  status: (c.status ?? '').toLowerCase(),
                  conclusion: (c.conclusion ?? '').toLowerCase(),
                  url: c.detailsUrl ?? ''
                })
              )
            : []

          resolve({
            number: pr.number,
            title: pr.title ?? '',
            state: pr.state === 'MERGED' ? 'merged' : pr.state === 'CLOSED' ? 'closed' : 'open',
            author: pr.author?.login ?? '',
            body: pr.body ?? '',
            branch: pr.headRefName ?? '',
            baseBranch: pr.baseRefName ?? '',
            additions: pr.additions ?? 0,
            deletions: pr.deletions ?? 0,
            commits: pr.commits?.totalCount ?? pr.commits?.length ?? 0,
            labels: Array.isArray(pr.labels) ? pr.labels.map((l: { name: string }) => l.name) : [],
            url: pr.url ?? '',
            createdAt: pr.createdAt ?? '',
            updatedAt: pr.updatedAt ?? '',
            comments,
            checks
          })
        } catch {
          resolve(null)
        }
      }
    )
  })
}

/**
 * Fetch failed build logs for a GitHub Actions check run.
 * Accepts the detailsUrl from statusCheckRollup and extracts the run ID.
 * Uses `gh run view --log-failed` to get only the failed step output.
 */
export async function getCheckRunLogs(cwd: string, detailsUrl: string): Promise<string> {
  // detailsUrl patterns:
  //   https://github.com/{owner}/{repo}/actions/runs/{runId}/job/{jobId}
  //   https://github.com/{owner}/{repo}/runs/{runId}
  const runMatch = detailsUrl.match(/\/actions\/runs\/(\d+)/)
  const legacyMatch = !runMatch ? detailsUrl.match(/\/runs\/(\d+)/) : null
  const runId = runMatch?.[1] ?? legacyMatch?.[1]

  if (!runId) {
    return `Could not extract run ID from URL: ${detailsUrl}`
  }

  const ghRepo = await getGitHubRepo(cwd)
  if (!ghRepo) return 'Could not determine GitHub repository'

  const nwo = `${ghRepo.owner}/${ghRepo.repo}`

  return new Promise((resolve) => {
    execFile(
      'gh',
      ['run', 'view', runId, '--repo', nwo, '--log-failed'],
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          // Fallback: try full log if --log-failed returns nothing
          execFile(
            'gh',
            ['run', 'view', runId, '--repo', nwo, '--log'],
            { cwd, maxBuffer: 10 * 1024 * 1024 },
            (err2, stdout2) => {
              if (err2) {
                log.warn('github', `gh run view --log failed: ${(err2 as Error).message}`)
                resolve(`Failed to fetch logs: ${(err2 as Error).message}`)
              } else {
                resolve(truncateLogs(stdout2 || ''))
              }
            }
          )
          return
        }
        resolve(truncateLogs(stdout || ''))
      }
    )
  })
}

/** Truncate logs to a reasonable size for display and sending to Claude. */
function truncateLogs(logs: string, maxLines = 500): string {
  const lines = logs.split('\n')
  if (lines.length <= maxLines) return logs
  return `... (${lines.length - maxLines} lines truncated)\n` + lines.slice(-maxLines).join('\n')
}
