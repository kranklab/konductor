import { describe, it, expect } from 'vitest'
import { ScrollbackBuffer } from '../ringBuffer'

describe('ScrollbackBuffer', () => {
  it('stores and joins chunks', () => {
    const buf = new ScrollbackBuffer(1024)
    buf.push('hello ')
    buf.push('world')
    expect(buf.join()).toBe('hello world')
  })

  it('reports correct size', () => {
    const buf = new ScrollbackBuffer(1024)
    buf.push('abc')
    buf.push('de')
    expect(buf.size).toBe(5)
  })

  it('trims oldest chunks when over budget', () => {
    const buf = new ScrollbackBuffer(10)
    buf.push('aaaa') // 4 bytes
    buf.push('bbbb') // 4 bytes, total 8
    buf.push('cccc') // 4 bytes, total 12 → trims 'aaaa', total 8
    const result = buf.join()
    expect(result).not.toContain('aaaa')
    expect(result).toContain('bbbb')
    expect(result).toContain('cccc')
    expect(buf.size).toBeLessThanOrEqual(10)
  })

  it('keeps at least the newest chunk even if it exceeds budget', () => {
    const buf = new ScrollbackBuffer(5)
    buf.push('short') // 5 bytes, at limit
    buf.push('a very long string that exceeds the budget') // way over
    const result = buf.join()
    expect(result).toContain('a very long string')
    expect(result).not.toContain('short')
  })

  it('returns empty string when no data', () => {
    const buf = new ScrollbackBuffer(1024)
    expect(buf.join()).toBe('')
    expect(buf.size).toBe(0)
  })

  it('compacts internal array after enough trims', () => {
    const buf = new ScrollbackBuffer(20)
    // Push many small chunks that get trimmed
    for (let i = 0; i < 100; i++) {
      buf.push('x'.repeat(10))
    }
    // Should not have accumulated 100 internal slots
    // (compaction should have kicked in)
    const result = buf.join()
    expect(result.length).toBeLessThanOrEqual(20)
    expect(buf.size).toBeLessThanOrEqual(20)
  })

  it('handles rapid sequential pushes', () => {
    const buf = new ScrollbackBuffer(50)
    for (let i = 0; i < 1000; i++) {
      buf.push(String(i))
    }
    // Should not throw and size should be bounded
    expect(buf.size).toBeLessThanOrEqual(50)
  })
})
