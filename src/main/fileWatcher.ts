import { execFile } from 'child_process'
import { watch, type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'

export interface ChangedFile {
  path: string
  type: 'add' | 'change' | 'unlink'
  timestamp: number
}

export interface FileWatcher {
  close(): void
  getChanges(): ChangedFile[]
}

function parseGitStatus(stdout: string): ChangedFile[] {
  const now = Date.now()
  const files: ChangedFile[] = []

  for (const line of stdout.split('\n')) {
    if (!line) continue

    const xy = line.substring(0, 2)
    const filePath = line.substring(3)

    let type: ChangedFile['type']
    if (xy === '??' || xy[0] === 'A' || xy[1] === 'A') {
      type = 'add'
    } else if (xy[0] === 'D' || xy[1] === 'D') {
      type = 'unlink'
    } else {
      type = 'change'
    }

    files.push({ path: filePath, type, timestamp: now })
  }

  return files
}

function runGitStatus(cwd: string): Promise<ChangedFile[]> {
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain'], { cwd }, (err, stdout) => {
      if (err) {
        // Not a git repo or git not installed — return empty
        resolve([])
        return
      }
      resolve(parseGitStatus(stdout))
    })
  })
}

export function createFileWatcher(
  sessionId: string,
  cwd: string,
  window: BrowserWindow
): FileWatcher {
  let changes: ChangedFile[] = []
  let watcher: FSWatcher | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const emit = (): void => {
    if (!closed && !window.isDestroyed()) {
      window.webContents.send('file-changed', { sessionId, changes: [...changes] })
    }
  }

  const refresh = (): void => {
    if (closed) return
    // Debounce rapid FS events into a single git status call
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      changes = await runGitStatus(cwd)
      emit()
    }, 300)
  }

  // Initial load
  runGitStatus(cwd).then((initial) => {
    if (closed) return
    changes = initial
    emit()
  })

  // Watch for FS changes to trigger git status refresh
  watcher = watch(cwd, {
    ignored: ['**/.git/**', '**/node_modules/**'],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  })

  watcher.on('add', refresh)
  watcher.on('change', refresh)
  watcher.on('unlink', refresh)

  return {
    close(): void {
      closed = true
      if (debounceTimer) clearTimeout(debounceTimer)
      watcher?.close()
    },
    getChanges(): ChangedFile[] {
      return [...changes]
    }
  }
}
