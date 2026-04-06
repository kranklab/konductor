import { describe, it, expect } from 'vitest'
import { stripAnsi } from '../../shared/stripAnsi'

describe('stripAnsi', () => {
  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world')
  })

  it('strips SGR color codes', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green')
  })

  it('strips bold/underline sequences', () => {
    expect(stripAnsi('\x1b[1mbold\x1b[22m \x1b[4munderline\x1b[24m')).toBe('bold underline')
  })

  it('strips 256-color and truecolor sequences', () => {
    expect(stripAnsi('\x1b[38;5;196mred\x1b[0m')).toBe('red')
    expect(stripAnsi('\x1b[38;2;255;0;0mtrue red\x1b[0m')).toBe('true red')
  })

  it('strips cursor movement sequences', () => {
    expect(stripAnsi('\x1b[2Aup\x1b[3Bdown\x1b[Hhome')).toBe('updownhome')
  })

  it('strips OSC sequences (terminal title)', () => {
    expect(stripAnsi('\x1b]0;my title\x07prompt$ ')).toBe('prompt$ ')
  })

  it('strips character set designations', () => {
    expect(stripAnsi('\x1b(Btext\x1b)0more')).toBe('textmore')
  })

  it('handles mixed sequences in realistic terminal output', () => {
    const raw =
      '\x1b]0;user@host:~\x07\x1b[01;32muser@host\x1b[00m:\x1b[01;34m~\x1b[00m$ ls\r\nfile1  file2\r\n'
    expect(stripAnsi(raw)).toBe('user@host:~$ ls\r\nfile1  file2\r\n')
  })

  it('returns empty string for empty input', () => {
    expect(stripAnsi('')).toBe('')
  })

  it('handles erase-in-line and erase-in-display', () => {
    expect(stripAnsi('text\x1b[Kmore\x1b[2J')).toBe('textmore')
  })
})
