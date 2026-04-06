import type { BrowserWindow } from 'electron'

export interface LogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  category: string
  message: string
}

const MAX_ENTRIES = 500

class Logger {
  private buffer: LogEntry[] = []
  private window: BrowserWindow | null = null

  setWindow(win: BrowserWindow): void {
    this.window = win
  }

  info(category: string, message: string): void {
    this.write('info', category, message)
    console.log(`[${category}] ${message}`)
  }

  warn(category: string, message: string): void {
    this.write('warn', category, message)
    console.warn(`[${category}] ${message}`)
  }

  error(category: string, message: string): void {
    this.write('error', category, message)
    console.error(`[${category}] ${message}`)
  }

  getHistory(): LogEntry[] {
    return this.buffer.slice()
  }

  private write(level: LogEntry['level'], category: string, message: string): void {
    const entry: LogEntry = { timestamp: Date.now(), level, category, message }

    if (this.buffer.length >= MAX_ENTRIES) {
      this.buffer.shift()
    }
    this.buffer.push(entry)

    try {
      this.window?.webContents.send('app-log', entry)
    } catch {
      // window may have been destroyed
    }
  }
}

export const log = new Logger()
