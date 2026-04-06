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

/** Like git() but resolves to empty string on error (for best-effort queries). Does NOT trim output. */
function gitSafe(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (err, stdout) => {
      if (err) resolve('')
      else resolve(stdout || '')
    })
  })
}

/** Run gh CLI, resolving to empty string on error. */
function ghSafe(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('gh', args, { cwd }, (err, stdout) => {
      if (err) {
        console.warn('[gh]', args.slice(0, 3).join(' '), 'failed:', (err as Error).message)
        resolve('')
      } else {
        resolve((stdout || '').trim())
      }
    })
  })
}

function getDefaultBranch(cwd: string): Promise<string> {
  return git(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd)
    .then((ref) => ref.replace('refs/remotes/origin/', ''))
    .catch(() => 'main')
}

export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  const stdout = await git(['worktree', 'list', '--porcelain'], cwd)

  const worktrees: WorktreeInfo[] = []
  const blocks = stdout.split('\n\n')

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

  return worktrees
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

export async function listBranches(cwd: string): Promise<string[]> {
  const stdout = await git(['branch', '--format=%(refname:short)', '--sort=-committerdate'], cwd)
  return stdout.split('\n').filter((b) => b.length > 0)
}

async function getAheadCount(cwd: string, branch: string, mainBranch: string): Promise<number> {
  const stdout = await gitSafe(['rev-list', '--count', `${mainBranch}..${branch}`], cwd)
  return parseInt(stdout.trim(), 10) || 0
}

const NO_PR: PrInfo = { state: 'none' as const, number: 0, url: '' }

/** Fetch all PR statuses in a single gh call, indexed by branch name. */
export async function batchGetPrStatuses(cwd: string): Promise<Map<string, PrInfo>> {
  const result = new Map<string, PrInfo>()
  const stdout = await ghSafe(
    ['pr', 'list', '--state', 'all', '--json', 'headRefName,state,number,url', '--limit', '200'],
    cwd
  )
  if (!stdout) return result

  try {
    const prs = JSON.parse(stdout)
    for (const pr of prs) {
      if (!pr.headRefName) continue
      // Only keep the first PR per branch (most recent)
      if (result.has(pr.headRefName)) continue
      result.set(pr.headRefName, {
        state: (pr.state as string).toLowerCase() as PrState,
        number: pr.number,
        url: pr.url
      })
    }
  } catch {
    // malformed JSON — return empty map
  }

  return result
}

async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  const stdout = await gitSafe(['status', '--porcelain'], worktreePath)
  return stdout.trim().length > 0
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

export async function getBranchDetails(cwd: string): Promise<BranchDetail[]> {
  const SEP = '%00'
  const format = [
    '%(refname:short)',
    '%(HEAD)',
    '%(upstream:short)',
    '%(upstream:track)',
    '%(committerdate:iso8601)',
    '%(committerdate:relative)',
    '%(subject)'
  ].join(SEP)

  const stdout = await git(
    [
      'for-each-ref',
      `--format=${format}`,
      '--sort=-committerdate',
      'refs/heads/',
      'refs/remotes/'
    ],
    cwd
  )

  let worktrees: WorktreeInfo[] = []
  try {
    worktrees = await listWorktrees(cwd)
  } catch {
    // ignore – worktree info is optional
  }

  const wtByBranch = new Map(worktrees.map((w) => [w.branch, w.path]))
  const mainBranch = 'origin/' + (worktrees.find((w) => w.isMain)?.branch ?? 'main')

  // Batch-fetch all PR statuses in a single gh call
  const prStatuses = await batchGetPrStatuses(cwd)

  const parsed = stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => parseBranchLine(line))
    .filter((obj) => obj !== null)

  // Separate local and remote entries. Remote refs start with "origin/".
  const localEntries: typeof parsed = []
  const remoteEntries: typeof parsed = []
  for (const obj of parsed) {
    if (obj.name.startsWith('origin/')) {
      // Skip origin/HEAD pointer
      if (obj.name === 'origin/HEAD') continue
      remoteEntries.push(obj)
    } else {
      localEntries.push(obj)
    }
  }

  const localNames = new Set(localEntries.map((e) => e.name))

  // Build details for local branches
  const localBranches: BranchDetail[] = await Promise.all(
    localEntries.map(async (obj) => {
      const name: string = obj.name
      const worktreePath = wtByBranch.get(name) || ''
      const isMain = name === mainBranch

      const [aheadCount, dirty] = await Promise.all([
        isMain ? Promise.resolve(0) : getAheadCount(cwd, name, mainBranch),
        worktreePath ? isWorktreeDirty(worktreePath) : Promise.resolve(false)
      ])

      const pr = prStatuses.get(name) ?? NO_PR

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
        pr,
        remoteOnly: false
      }
    })
  )

  // Build details for remote-only branches (no local counterpart)
  const remoteBranches: BranchDetail[] = await Promise.all(
    remoteEntries
      .filter((obj) => {
        const shortName = obj.name.replace(/^origin\//, '')
        return !localNames.has(shortName)
      })
      .map(async (obj) => {
        const shortName = obj.name.replace(/^origin\//, '')
        const isMain = obj.name === mainBranch

        const aheadCount = isMain
          ? 0
          : await getAheadCount(cwd, obj.name, mainBranch)

        const pr = prStatuses.get(shortName) ?? NO_PR

        return {
          name: shortName,
          isHead: false,
          upstream: obj.name,
          gone: false,
          lastCommitDate: obj.date || '',
          lastCommitRelative: obj.relative || '',
          lastCommitSubject: obj.subject || '',
          worktreePath: '',
          aheadCount,
          dirty: false,
          pr,
          remoteOnly: true
        }
      })
  )

  return [...localBranches, ...remoteBranches]
}

/** List files changed on a branch (committed vs origin/main + uncommitted in worktree) */
export async function getBranchFiles(
  cwd: string,
  branch: string,
  worktreePath: string
): Promise<BranchFile[]> {
  const files: BranchFile[] = []

  const defaultBranch = await getDefaultBranch(cwd)
  const base = `origin/${defaultBranch}`

  // Committed changes: branch vs origin default branch
  const committed = await gitSafe(['diff', '--name-status', `${base}...${branch}`], cwd)

  for (const line of committed.split('\n')) {
    if (!line) continue
    const [statusRaw, ...pathParts] = line.split('\t')
    const status = statusRaw.charAt(0) as BranchFile['status']
    const path = pathParts[pathParts.length - 1] // handles renames (R\told\tnew)
    if (path) files.push({ path, status, source: 'committed' })
  }

  // Uncommitted changes in the worktree
  if (worktreePath) {
    const uncommitted = await gitSafe(['status', '--porcelain', '--no-renames'], worktreePath)

    for (const line of uncommitted.split('\n')) {
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

/** Get diff for a single file — either committed (branch vs origin default) or uncommitted (worktree vs HEAD) */
export async function getBranchDiff(
  cwd: string,
  branch: string,
  filePath: string,
  source: 'committed' | 'uncommitted',
  worktreePath: string
): Promise<string> {
  if (source === 'committed') {
    const defaultBranch = await getDefaultBranch(cwd)
    const base = `origin/${defaultBranch}`
    return gitSafe(['diff', `${base}...${branch}`, '--', filePath], cwd)
  }

  // Uncommitted: run in the worktree directory
  const dir = worktreePath || cwd
  const stdout = await gitSafe(['diff', 'HEAD', '--', filePath], dir)
  if (stdout) return stdout

  // No diff from HEAD — file is likely untracked, try --no-index
  return gitSafe(['diff', '--no-index', '--', '/dev/null', filePath], dir)
}

export async function deleteBranch(cwd: string, branch: string, force: boolean): Promise<void> {
  await git(['branch', force ? '-D' : '-d', branch], cwd)
}

export async function deleteRemoteBranch(
  cwd: string,
  remote: string,
  branch: string
): Promise<void> {
  await git(['push', remote, '--delete', branch], cwd)
}

export async function fetchPrune(cwd: string): Promise<void> {
  await git(['fetch', '--prune'], cwd)
}
