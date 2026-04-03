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
