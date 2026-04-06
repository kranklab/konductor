import { appendFileSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { BrowserWindow } from 'electron'

export interface LogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  category: string
  message: string
}

const LOG_DIR = join(homedir(), '.konductor')
const LOG_FILE = join(LOG_DIR, 'app.log')
const MAX_FILE_SIZE = 512 * 1024 // 512 KB

class Logger {
  private window: BrowserWindow | null = null

  constructor() {
    try {
      mkdirSync(LOG_DIR, { recursive: true })
    } catch {
      // best-effort
    }
  }

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
    try {
      const raw = readFileSync(LOG_FILE, 'utf-8')
      const entries: LogEntry[] = []
      for (const line of raw.split('\n')) {
        if (!line) continue
        try {
          entries.push(JSON.parse(line))
        } catch {
          // skip malformed lines
        }
      }
      return entries
    } catch {
      return []
    }
  }

  private write(level: LogEntry['level'], category: string, message: string): void {
    const entry: LogEntry = { timestamp: Date.now(), level, category, message }

    try {
      this.rotateIfNeeded()
      appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
    } catch {
      // best-effort
    }

    try {
      this.window?.webContents.send('app-log', entry)
    } catch {
      // window may have been destroyed
    }
  }

  private rotateIfNeeded(): void {
    try {
      const stats = statSync(LOG_FILE)
      if (stats.size > MAX_FILE_SIZE) {
        // Keep the second half of the file
        const raw = readFileSync(LOG_FILE, 'utf-8')
        const lines = raw.split('\n')
        const half = Math.floor(lines.length / 2)
        writeFileSync(LOG_FILE, lines.slice(half).join('\n'))
      }
    } catch {
      // file doesn't exist yet, that's fine
    }
  }
}

export const log = new Logger()
