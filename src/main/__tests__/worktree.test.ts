import { describe, it, expect } from 'vitest'
import { parseBranchLine } from '../worktree'

describe('parseBranchLine', () => {
  it('parses a normal branch line', () => {
    const line = [
      'feature/login',
      '*',
      'origin/feature/login',
      '[ahead 2]',
      '2025-01-15 10:30:00 +0000',
      '3 days ago',
      'Add login form'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).toEqual({
      name: 'feature/login',
      head: '*',
      upstream: 'origin/feature/login',
      track: '[ahead 2]',
      date: '2025-01-15 10:30:00 +0000',
      relative: '3 days ago',
      subject: 'Add login form'
    })
  })

  it('handles subject with double quotes', () => {
    const line = [
      'main',
      ' ',
      'origin/main',
      '',
      '2025-01-15 10:30:00 +0000',
      '1 day ago',
      'Fix "broken" parser'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).not.toBeNull()
    expect(result!.subject).toBe('Fix "broken" parser')
  })

  it('handles subject with backslashes', () => {
    const line = [
      'fix/paths',
      ' ',
      '',
      '',
      '2025-01-15 10:30:00 +0000',
      '2 hours ago',
      'Fix C:\\Users\\path issue'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).not.toBeNull()
    expect(result!.subject).toBe('Fix C:\\Users\\path issue')
  })

  it('returns null for malformed line (wrong number of fields)', () => {
    expect(parseBranchLine('only\0two')).toBeNull()
    expect(parseBranchLine('')).toBeNull()
    expect(parseBranchLine('a\0b\0c\0d\0e\0f\0g\0extra')).toBeNull()
  })

  it('handles empty fields', () => {
    const line = [
      'develop',
      ' ',
      '',
      '',
      '2025-01-15 10:30:00 +0000',
      '5 minutes ago',
      'Initial commit'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).not.toBeNull()
    expect(result!.upstream).toBe('')
    expect(result!.track).toBe('')
  })

  it('handles subject with newline-like content', () => {
    const line = [
      'feature/x',
      ' ',
      '',
      '',
      '2025-01-15 10:30:00 +0000',
      '1 day ago',
      'Subject with {braces} and [brackets]'
    ].join('\0')
    const result = parseBranchLine(line)
    expect(result).not.toBeNull()
    expect(result!.subject).toBe('Subject with {braces} and [brackets]')
  })
})
