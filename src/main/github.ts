import { execFile } from 'child_process'
import { log } from './logger'
import type { GitHubRepo, GitHubPR, GitHubIssue } from '../shared/types'

export type { GitHubRepo, GitHubPR, GitHubIssue }

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
