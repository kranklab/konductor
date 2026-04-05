import { describe, it, expect } from 'vitest'
import { parseGitStatus } from '../fileWatcher'

describe('parseGitStatus', () => {
  it('maps ?? (untracked) to add', () => {
    const result = parseGitStatus('?? newfile.ts')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ path: 'newfile.ts', type: 'add' })
  })

  it('maps A (staged add) to add', () => {
    const result = parseGitStatus('A  staged.ts')

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('add')
  })

  it('maps index A (added in index) to add', () => {
    const result = parseGitStatus(' A unstaged-add.ts')

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('add')
  })

  it('maps D (deleted) to unlink', () => {
    const result = parseGitStatus('D  removed.ts')

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('unlink')
  })

  it('maps worktree D to unlink', () => {
    const result = parseGitStatus(' D deleted-in-worktree.ts')

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('unlink')
  })

  it('maps M (modified) to change', () => {
    const result = parseGitStatus('M  modified.ts')

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('change')
  })

  it('maps MM (modified in both) to change', () => {
    const result = parseGitStatus('MM both-modified.ts')

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('change')
  })

  it('returns empty array for empty string', () => {
    expect(parseGitStatus('')).toEqual([])
  })

  it('parses multiple files', () => {
    const input = ['?? new.ts', 'M  changed.ts', 'D  deleted.ts', ' M worktree-modified.ts'].join(
      '\n'
    )

    const result = parseGitStatus(input)

    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({ path: 'new.ts', type: 'add' })
    expect(result[1]).toMatchObject({ path: 'changed.ts', type: 'change' })
    expect(result[2]).toMatchObject({ path: 'deleted.ts', type: 'unlink' })
    expect(result[3]).toMatchObject({ path: 'worktree-modified.ts', type: 'change' })
  })

  it('handles paths with spaces', () => {
    const result = parseGitStatus('M  src/my file.ts')

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('src/my file.ts')
  })

  it('sets timestamps to current time', () => {
    const before = Date.now()
    const result = parseGitStatus('M  file.ts')
    const after = Date.now()

    expect(result[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(result[0].timestamp).toBeLessThanOrEqual(after)
  })
})
