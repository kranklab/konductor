import { describe, it, expect } from 'vitest'
import { isPathWithinAllowedDirs } from '../pathValidation'

describe('isPathWithinAllowedDirs', () => {
  it('allows path within cwd', () => {
    expect(isPathWithinAllowedDirs('/home/user/project/src/foo.ts', ['/home/user/project'])).toBe(
      true
    )
  })

  it('blocks path outside all cwds', () => {
    expect(isPathWithinAllowedDirs('/etc/passwd', ['/home/user/project'])).toBe(false)
  })

  it('blocks path traversal with ../', () => {
    expect(
      isPathWithinAllowedDirs('/home/user/project/../../etc/passwd', ['/home/user/project'])
    ).toBe(false)
  })

  it('allows when any of multiple cwds match', () => {
    expect(
      isPathWithinAllowedDirs('/opt/other/file.txt', ['/home/user/project', '/opt/other'])
    ).toBe(true)
  })

  it('blocks when no cwds provided (empty array)', () => {
    expect(isPathWithinAllowedDirs('/home/user/project/file.ts', [])).toBe(false)
  })

  it('blocks the cwd directory itself (must be a file within it)', () => {
    expect(isPathWithinAllowedDirs('/home/user/project', ['/home/user/project'])).toBe(false)
  })

  it('allows deeply nested paths', () => {
    expect(isPathWithinAllowedDirs('/home/user/project/a/b/c/d/e.ts', ['/home/user/project'])).toBe(
      true
    )
  })

  it('blocks sibling directory traversal', () => {
    expect(
      isPathWithinAllowedDirs('/home/user/other-project/secret.key', ['/home/user/project'])
    ).toBe(false)
  })
})
