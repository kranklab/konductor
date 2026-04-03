import { execFile } from 'child_process'
import { join } from 'path'
import { mkdir, rm } from 'fs/promises'

export interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
}

export function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  return new Promise((resolve, reject) => {
    execFile('git', ['worktree', 'list', '--porcelain'], { cwd }, (err, stdout) => {
      if (err) {
        reject(err)
        return
      }

      const worktrees: WorktreeInfo[] = []
      const blocks = stdout.trim().split('\n\n')

      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].split('\n')
        let path = ''
        let branch = ''

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            path = line.substring('worktree '.length)
          } else if (line.startsWith('branch ')) {
            branch = line.substring('branch '.length).replace('refs/heads/', '')
          } else if (line === 'detached') {
            branch = '(detached)'
          }
        }

        if (path) {
          worktrees.push({ path, branch, isMain: i === 0 })
        }
      }

      resolve(worktrees)
    })
  })
}

export async function createWorktree(
  cwd: string,
  branch: string,
  newBranch: boolean
): Promise<WorktreeInfo> {
  const worktreeDir = join(cwd, '.konductor', 'worktrees')
  const worktreePath = join(worktreeDir, branch)

  const args = newBranch
    ? ['worktree', 'add', '-b', branch, worktreePath]
    : ['worktree', 'add', worktreePath, branch]

  await mkdir(worktreeDir, { recursive: true })

  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve({ path: worktreePath, branch, isMain: false })
    })
  })
}

export async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  await rm(worktreePath, { recursive: true, force: true })

  await new Promise<void>((resolve) => {
    execFile('git', ['worktree', 'prune'], { cwd: repoRoot }, () => {
      resolve()
    })
  })
}

export function listBranches(cwd: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['branch', '--format=%(refname:short)', '--sort=-committerdate'],
      { cwd },
      (err, stdout) => {
        if (err) {
          reject(err)
          return
        }
        resolve(
          stdout
            .trim()
            .split('\n')
            .filter((b) => b.length > 0)
        )
      }
    )
  })
}

export interface BranchDetail {
  name: string
  isHead: boolean
  upstream: string
  gone: boolean
  lastCommitDate: string
  lastCommitRelative: string
  lastCommitSubject: string
  worktreePath: string
}

export function getBranchDetails(cwd: string): Promise<BranchDetail[]> {
  return new Promise((resolve, reject) => {
    const format = [
      '{"name":"%(refname:short)"',
      '"head":"%(HEAD)"',
      '"upstream":"%(upstream:short)"',
      '"track":"%(upstream:track)"',
      '"date":"%(committerdate:iso8601)"',
      '"relative":"%(committerdate:relative)"',
      '"subject":"%(subject)"}'
    ].join(',')

    execFile(
      'git',
      ['branch', `--format=${format}`, '--sort=-committerdate'],
      { cwd },
      async (err, stdout) => {
        if (err) {
          reject(err)
          return
        }

        let worktrees: WorktreeInfo[] = []
        try {
          worktrees = await listWorktrees(cwd)
        } catch {
          // ignore – worktree info is optional
        }

        const wtByBranch = new Map(worktrees.map((w) => [w.branch, w.path]))

        const branches: BranchDetail[] = stdout
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => {
            const obj = JSON.parse(line)
            return {
              name: obj.name,
              isHead: obj.head === '*',
              upstream: obj.upstream || '',
              gone: obj.track.includes('gone'),
              lastCommitDate: obj.date || '',
              lastCommitRelative: obj.relative || '',
              lastCommitSubject: obj.subject || '',
              worktreePath: wtByBranch.get(obj.name) || ''
            }
          })

        resolve(branches)
      }
    )
  })
}

export function deleteBranch(cwd: string, branch: string, force: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('git', ['branch', force ? '-D' : '-d', branch], { cwd }, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

export function deleteRemoteBranch(
  cwd: string,
  remote: string,
  branch: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('git', ['push', remote, '--delete', branch], { cwd }, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

export function fetchPrune(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('git', ['fetch', '--prune'], { cwd }, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}
