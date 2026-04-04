import { describe, it, expect } from 'vitest'
import { shellQuote } from '../shellEscape'

describe('shellQuote', () => {
  it('wraps simple string in single quotes', () => {
    expect(shellQuote('/path/to/script.sh')).toBe("'/path/to/script.sh'")
  })

  it('escapes internal single quotes', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })

  it('neutralizes dollar signs (safe inside single quotes)', () => {
    expect(shellQuote('$HOME/bin')).toBe("'$HOME/bin'")
  })

  it('neutralizes backticks (safe inside single quotes)', () => {
    expect(shellQuote('`whoami`')).toBe("'`whoami`'")
  })

  it('handles empty string', () => {
    expect(shellQuote('')).toBe("''")
  })

  it('handles path with spaces', () => {
    expect(shellQuote('/path/to/my file.sh')).toBe("'/path/to/my file.sh'")
  })

  it('handles string with multiple single quotes', () => {
    expect(shellQuote("a'b'c")).toBe("'a'\\''b'\\''c'")
  })

  it('handles string with double quotes (safe inside single quotes)', () => {
    expect(shellQuote('say "hello"')).toBe('\'say "hello"\'')
  })
})
