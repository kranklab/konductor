import { execFile } from 'child_process'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import type { WorktreeInfo, BranchDetail, PrInfo, PrState, BranchFile } from '../shared/types'

export type { WorktreeInfo, BranchDetail, BranchFile }
export type { PrState, PrInfo } from '../shared/types'

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout.trim())
    })
  })
}

function getDefaultBranch(cwd: string): Promise<string> {
  return git(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd)
    .then((ref) => ref.replace('refs/remotes/origin/', ''))
    .catch(() => 'main')
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
  newBranch: boolean,
  updateFromOrigin: boolean = false
): Promise<WorktreeInfo> {
  const worktreeDir = join(cwd, '.konductor', 'worktrees')
  const worktreePath = join(worktreeDir, branch)

  if (updateFromOrigin) {
    await git(['fetch', 'origin'], cwd)
  }

  const args = newBranch
    ? ['worktree', 'add', '-b', branch, worktreePath]
    : ['worktree', 'add', worktreePath, branch]

  await mkdir(worktreeDir, { recursive: true })

  await git(args, cwd)

  if (updateFromOrigin && newBranch) {
    const defaultBranch = await getDefaultBranch(cwd)
    await git(['reset', '--hard', `origin/${defaultBranch}`], worktreePath)
  }

  return { path: worktreePath, branch, isMain: false }
}

export async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  // Use git worktree remove first — it handles cleanup of .git references
  await new Promise<void>((resolve, reject) => {
    execFile('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoRoot }, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  }).catch(async () => {
    // Fallback: force-remove the directory (handles suid binaries like chrome-sandbox
    // that Node's fs.rm can't delete) then prune the worktree list
    await new Promise<void>((resolve) => {
      execFile('rm', ['-rf', worktreePath], () => resolve())
    })
    await new Promise<void>((resolve) => {
      execFile('git', ['worktree', 'prune'], { cwd: repoRoot }, () => resolve())
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

function getAheadCount(cwd: string, branch: string, mainBranch: string): Promise<number> {
  return new Promise((resolve) => {
    execFile('git', ['rev-list', '--count', `${mainBranch}..${branch}`], { cwd }, (err, stdout) => {
      if (err) {
        resolve(-1)
        return
      }
      resolve(parseInt(stdout.trim(), 10) || 0)
    })
  })
}

const NO_PR: PrInfo = { state: 'none' as const, number: 0, url: '' }

function getPrStatus(cwd: string, branch: string): Promise<PrInfo> {
  return new Promise((resolve) => {
    execFile(
      'gh',
      [
        'pr',
        'list',
        '--head',
        branch,
        '--state',
        'all',
        '--json',
        'state,number,url',
        '--limit',
        '1'
      ],
      { cwd },
      (err, stdout) => {
        if (err) {
          resolve(NO_PR)
          return
        }
        try {
          const prs = JSON.parse(stdout.trim())
          if (prs.length === 0) {
            resolve(NO_PR)
            return
          }
          const pr = prs[0]
          resolve({
            state: (pr.state as string).toLowerCase() as PrState,
            number: pr.number,
            url: pr.url
          })
        } catch {
          resolve(NO_PR)
        }
      }
    )
  })
}

function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain'], { cwd: worktreePath }, (err, stdout) => {
      if (err) {
        resolve(false)
        return
      }
      resolve(stdout.trim().length > 0)
    })
  })
}

/** Parse a single line of NUL-delimited git branch output. */
export function parseBranchLine(line: string): {
  name: string
  head: string
  upstream: string
  track: string
  date: string
  relative: string
  subject: string
} | null {
  const parts = line.split('\0')
  if (parts.length !== 7) return null
  return {
    name: parts[0],
    head: parts[1],
    upstream: parts[2],
    track: parts[3],
    date: parts[4],
    relative: parts[5],
    subject: parts[6]
  }
}

export function getBranchDetails(cwd: string): Promise<BranchDetail[]> {
  return new Promise((resolve, reject) => {
    const SEP = '%x00'
    const format = [
      '%(refname:short)',
      '%(HEAD)',
      '%(upstream:short)',
      '%(upstream:track)',
      '%(committerdate:iso8601)',
      '%(committerdate:relative)',
      '%(subject)'
    ].join(SEP)

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
        const mainBranch = 'origin/' + (worktrees.find((w) => w.isMain)?.branch ?? 'main')

        const parsed = stdout
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => parseBranchLine(line))
          .filter((obj) => obj !== null)

        const branches: BranchDetail[] = await Promise.all(
          parsed.map(async (obj) => {
            const name: string = obj.name
            const worktreePath = wtByBranch.get(name) || ''
            const isMain = name === mainBranch

            const [aheadCount, dirty, pr] = await Promise.all([
              isMain ? Promise.resolve(0) : getAheadCount(cwd, name, mainBranch),
              worktreePath ? isWorktreeDirty(worktreePath) : Promise.resolve(false),
              isMain ? Promise.resolve(NO_PR) : getPrStatus(cwd, name)
            ])

            return {
              name,
              isHead: obj.head === '*',
              upstream: obj.upstream || '',
              gone: obj.track.includes('gone'),
              lastCommitDate: obj.date || '',
              lastCommitRelative: obj.relative || '',
              lastCommitSubject: obj.subject || '',
              worktreePath,
              aheadCount,
              dirty,
              pr
            }
          })
        )

        resolve(branches)
      }
    )
  })
}

/** List files changed on a branch (committed vs origin/main + uncommitted in worktree) */
export async function getBranchFiles(
  cwd: string,
  branch: string,
  worktreePath: string
): Promise<BranchFile[]> {
  const files: BranchFile[] = []

  // Committed changes: branch vs origin/main
  const committed = await new Promise<string>((resolve) => {
    execFile('git', ['diff', '--name-status', 'origin/main...' + branch], { cwd }, (err, stdout) =>
      resolve(err ? '' : stdout)
    )
  })

  for (const line of committed.trim().split('\n')) {
    if (!line) continue
    const [statusRaw, ...pathParts] = line.split('\t')
    const status = statusRaw.charAt(0) as BranchFile['status']
    const path = pathParts[pathParts.length - 1] // handles renames (R\told\tnew)
    if (path) files.push({ path, status, source: 'committed' })
  }

  // Uncommitted changes in the worktree
  if (worktreePath) {
    const uncommitted = await new Promise<string>((resolve) => {
      execFile(
        'git',
        ['status', '--porcelain', '--no-renames'],
        { cwd: worktreePath },
        (err, stdout) => resolve(err ? '' : stdout)
      )
    })

    for (const line of uncommitted.trim().split('\n')) {
      if (!line) continue
      const xy = line.substring(0, 2)
      const path = line.substring(3)
      let status: BranchFile['status'] = 'M'
      if (xy.includes('?')) status = 'A'
      else if (xy.includes('D')) status = 'D'
      else if (xy.includes('U')) status = 'U'
      files.push({ path, status, source: 'uncommitted' })
    }
  }

  return files
}

/** Get diff for a single file — either committed (branch vs origin/main) or uncommitted (worktree vs HEAD) */
export function getBranchDiff(
  cwd: string,
  branch: string,
  filePath: string,
  source: 'committed' | 'uncommitted',
  worktreePath: string
): Promise<string> {
  return new Promise((resolve) => {
    if (source === 'committed') {
      execFile('git', ['diff', 'origin/main...' + branch, '--', filePath], { cwd }, (err, stdout) =>
        resolve(err && !stdout ? '' : stdout || '')
      )
    } else {
      // Uncommitted: run in the worktree directory
      const dir = worktreePath || cwd
      execFile('git', ['diff', 'HEAD', '--', filePath], { cwd: dir }, (_err, stdout) => {
        if (stdout && stdout.trim()) {
          resolve(stdout)
        } else {
          // No diff from HEAD — file is likely untracked, try --no-index
          execFile(
            'git',
            ['diff', '--no-index', '--', '/dev/null', filePath],
            { cwd: dir },
            (_err2, stdout2) => resolve(stdout2 || '')
          )
        }
      })
    }
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

export function deleteRemoteBranch(cwd: string, remote: string, branch: string): Promise<void> {
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
