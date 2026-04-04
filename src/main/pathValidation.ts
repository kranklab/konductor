import { resolve, relative, isAbsolute } from 'path'

/**
 * Validates that filePath resolves to a location within one of the allowed directories.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 */
export function isPathWithinAllowedDirs(filePath: string, allowedDirs: string[]): boolean {
  if (allowedDirs.length === 0) return false
  const resolved = resolve(filePath)
  return allowedDirs.some((dir) => {
    const resolvedDir = resolve(dir)
    const rel = relative(resolvedDir, resolved)
    // rel must be non-empty (not the dir itself), not escape via '..', and not absolute
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  })
}
