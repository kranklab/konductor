/**
 * A size-limited string buffer that tracks total byte length.
 * Uses index-based trimming to avoid O(n) Array.shift() costs.
 */
export class ScrollbackBuffer {
  private chunks: string[] = []
  private totalSize = 0
  private startIndex = 0
  private readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  push(data: string): void {
    this.chunks.push(data)
    this.totalSize += data.length

    // Trim oldest chunks while over budget (keep at least the newest chunk)
    while (this.totalSize > this.maxSize && this.startIndex < this.chunks.length - 1) {
      this.totalSize -= this.chunks[this.startIndex].length
      this.chunks[this.startIndex] = '' // release reference for GC
      this.startIndex++
    }

    // Compact when wasted slots exceed half the array length
    if (this.startIndex > this.chunks.length / 2) {
      this.chunks = this.chunks.slice(this.startIndex)
      this.startIndex = 0
    }
  }

  join(): string {
    return this.chunks.slice(this.startIndex).join('')
  }

  get size(): number {
    return this.totalSize
  }
}
