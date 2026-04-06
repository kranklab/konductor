import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from './logger'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}
import { execFile } from 'child_process'
import { join } from 'path'
import { readFile, access } from 'fs/promises'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  createSession,
  listSessions,
  getSessionScrollback,
  writeToSession,
  resizeSession,
  killSession,
  killAllSessions,
  getSessionChanges,
  getAllSessionCwds,
  getClaudePath,
  getEnv,
  ensurePluginInstalled,
  listEnvScripts
} from './sessionManager'
import { isPathWithinAllowedDirs } from './pathValidation'
import { loadState, saveState, type PersistedState } from './store'
import { startActivityWatcher, stopActivityWatcher } from './activityWatcher'
import {
  listWorktrees,
  createWorktree,
  removeWorktree,
  listBranches,
  getBranchDetails,
  deleteBranch,
  deleteRemoteBranch,
  fetchPrune,
  getBranchFiles,
  getBranchDiff
} from './worktree'
import { getGitHubRepo, listPullRequests, listIssues } from './github'
import {
  createTerminal,
  getTerminalScrollback,
  writeToTerminal,
  resizeTerminal,
  killTerminal,
  killAllTerminals,
  killSessionTerminals
} from './terminalManager'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d0d0d',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (is.dev) {
      const worktreeMatch = process.cwd().match(/\.konductor\/worktrees\/([^/]+)/)
      if (worktreeMatch) {
        mainWindow!.setTitle(`Konductor [${worktreeMatch[1]}]`)
      }
    }
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── IPC Handler Registration ─────────────────────────────────────────

function registerStateHandlers(ipc: typeof ipcMain): void {
  ipc.handle('load-state', () => {
    return loadState()
  })

  ipc.handle('save-state', (_event, state: PersistedState) => {
    return saveState(state)
  })
}

function registerSessionHandlers(ipc: typeof ipcMain, window: BrowserWindow): void {
  ipc.handle(
    'create-session',
    (
      _event,
      cwd: string,
      opts?: { claudeSessionId?: string; name?: string; resume?: boolean; envScript?: string }
    ) => {
      if (!window) throw new Error('No main window')
      return createSession(cwd, window, opts)
    }
  )

  ipc.on('write-to-session', (_event, sessionId: string, data: string) => {
    writeToSession(sessionId, data)
  })

  ipc.on('resize-session', (_event, sessionId: string, cols: number, rows: number) => {
    resizeSession(sessionId, cols, rows)
  })

  ipc.on('kill-session', (_event, sessionId: string) => {
    killSessionTerminals(sessionId)
    killSession(sessionId)
  })

  // --- Shell terminal handlers ---

  ipc.handle('create-terminal', (_event, sessionId: string, cwd: string, envScript?: string) => {
    if (!window) throw new Error('No main window')
    return createTerminal(sessionId, cwd, window, envScript)
  })

  ipc.on('write-to-terminal', (_event, terminalId: string, data: string) => {
    writeToTerminal(terminalId, data)
  })

  ipc.on('resize-terminal', (_event, terminalId: string, cols: number, rows: number) => {
    resizeTerminal(terminalId, cols, rows)
  })

  ipc.on('kill-terminal', (_event, terminalId: string) => {
    killTerminal(terminalId)
  })

  ipc.handle('get-terminal-scrollback', (_event, terminalId: string) => {
    return getTerminalScrollback(terminalId)
  })

  ipc.handle('list-sessions', () => {
    return listSessions()
  })

  ipc.handle('get-scrollback', (_event, sessionId: string) => {
    return getSessionScrollback(sessionId)
  })

  ipc.handle(
    'generate-summary',
    async (_event, cwd: string, claudeSessionId: string): Promise<string> => {
      const pathKey = cwd.replace(/[/.]/g, '-')
      const transcriptPath = join(
        homedir(),
        '.claude',
        'projects',
        pathKey,
        `${claudeSessionId}.jsonl`
      )

      let context = ''
      try {
        await access(transcriptPath)
        const raw = await readFile(transcriptPath, 'utf-8')
        const snippets: string[] = []
        for (const line of raw.trim().split('\n')) {
          try {
            const entry = JSON.parse(line)
            if (entry.type !== 'user' && entry.type !== 'assistant') continue
            const content = entry.message?.content
            if (!content) continue
            const text = Array.isArray(content)
              ? content
                  .filter((b: { type: string }) => b.type === 'text')
                  .map((b: { text: string }) => b.text)
                  .join(' ')
              : typeof entry.message === 'string'
                ? entry.message
                : ''
            if (!text) continue
            snippets.push(`${entry.type}: ${text.slice(0, 500)}`)
            if (snippets.length >= 6) break
          } catch {
            // skip malformed lines
          }
        }
        context = snippets.join('\n\n')
      } catch (err) {
        log.warn('summary', `Failed to read transcript: ${(err as Error).message}`)
      }

      if (!context) return ''

      const prompt = `Summarize this Claude Code session in one short sentence (max 120 chars). Describe WHAT is being worked on, not HOW. No quotes or prefixes.\n\nConversation:\n${context}`

      return new Promise<string>((resolve) => {
        execFile(
          getClaudePath(),
          ['-p', '--model', 'claude-haiku-4-5-20251001', prompt],
          { env: getEnv(), timeout: 15000 },
          (err, stdout) => {
            if (err || !stdout) {
              if (err) log.warn('summary', `Claude CLI failed: ${(err as Error).message}`)
              resolve('')
              return
            }
            resolve(stdout.trim().slice(0, 200))
          }
        )
      })
    }
  )

  ipc.handle('get-changes', (_event, sessionId: string) => {
    return getSessionChanges(sessionId)
  })

  ipc.handle('list-env-scripts', (_event, cwd: string) => {
    return listEnvScripts(cwd)
  })
}

function registerFileHandlers(ipc: typeof ipcMain): void {
  ipc.handle('read-file', async (_event, filePath: string) => {
    const allowedDirs = getAllSessionCwds()
    if (!isPathWithinAllowedDirs(filePath, allowedDirs)) {
      throw new Error('Access denied: path outside session working directories')
    }
    const content = await readFile(filePath, 'utf-8')
    return content
  })

  ipc.handle('get-diff', (_event, cwd: string, filePath: string, isUntracked: boolean) => {
    return new Promise<string>((resolve) => {
      if (isUntracked) {
        execFile(
          'git',
          ['diff', '--no-index', '--', '/dev/null', filePath],
          { cwd },
          (_err, stdout) => {
            resolve(stdout || '')
          }
        )
      } else {
        execFile('git', ['diff', 'HEAD', '--', filePath], { cwd }, (err, stdout) => {
          if (err && !stdout) {
            log.warn('diff', `git diff failed for ${filePath}: ${(err as Error).message}`)
            resolve('')
            return
          }
          resolve(stdout || '')
        })
      }
    })
  })
}

function registerWorktreeHandlers(ipc: typeof ipcMain): void {
  ipc.handle('list-worktrees', (_event, cwd: string) => {
    return listWorktrees(cwd)
  })

  ipc.handle(
    'create-worktree',
    (_event, cwd: string, branch: string, newBranch: boolean, updateFromOrigin: boolean) => {
      return createWorktree(cwd, branch, newBranch, updateFromOrigin)
    }
  )

  ipc.handle('list-branches', (_event, cwd: string) => {
    return listBranches(cwd)
  })

  ipc.handle('get-branch-details', (_event, cwd: string) => {
    return getBranchDetails(cwd)
  })

  ipc.handle('delete-branch', (_event, cwd: string, branch: string, force: boolean) => {
    return deleteBranch(cwd, branch, force)
  })

  ipc.handle('delete-remote-branch', (_event, cwd: string, remote: string, branch: string) => {
    return deleteRemoteBranch(cwd, remote, branch)
  })

  ipc.handle('fetch-prune', (_event, cwd: string) => {
    return fetchPrune(cwd)
  })

  ipc.handle('remove-worktree', (_event, repoRoot: string, worktreePath: string) => {
    return removeWorktree(repoRoot, worktreePath)
  })

  ipc.handle('get-branch-files', (_event, cwd: string, branch: string, worktreePath: string) => {
    return getBranchFiles(cwd, branch, worktreePath)
  })

  ipc.handle(
    'get-branch-diff',
    (
      _event,
      cwd: string,
      branch: string,
      filePath: string,
      source: 'committed' | 'uncommitted',
      worktreePath: string
    ) => {
      return getBranchDiff(cwd, branch, filePath, source, worktreePath)
    }
  )
}

function registerGitHubHandlers(ipc: typeof ipcMain): void {
  ipc.handle('get-github-repo', (_event, cwd: string) => {
    return getGitHubRepo(cwd)
  })

  ipc.handle('list-pull-requests', (_event, cwd: string, state: string) => {
    return listPullRequests(cwd, state as 'open' | 'closed' | 'merged' | 'all')
  })

  ipc.handle('list-issues', (_event, cwd: string, state: string) => {
    return listIssues(cwd, state as 'open' | 'closed' | 'all')
  })

  ipc.handle('open-external', (_event, url: string) => {
    return shell.openExternal(url)
  })
}

function registerDialogHandlers(ipc: typeof ipcMain, window: BrowserWindow): void {
  ipc.handle('select-directory', async () => {
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipc.handle('select-file', async (_event, title?: string) => {
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      title: title ?? 'Select File',
      properties: ['openFile'],
      filters: [
        { name: 'Shell Scripts', extensions: ['sh', 'bash', 'zsh'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

function registerUpdateHandlers(ipc: typeof ipcMain): void {
  ipc.on('install-update', () => {
    autoUpdater.quitAndInstall()
  })
  ipc.on('check-for-updates', () => {
    if (is.dev) {
      log.warn('updater', 'Auto-update is not available in development mode')
      mainWindow?.webContents.send('update-status', {
        status: 'error',
        message: 'Auto-update is not available in development mode'
      })
      return
    }
    autoUpdater.checkForUpdates()
  })
  ipc.handle('get-logs', () => log.getHistory())
}

// ─── App Lifecycle ────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kranklab.konductor')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  log.setWindow(mainWindow!)
  log.info('app', `Konductor started (${is.dev ? 'dev' : 'production'})`)

  registerStateHandlers(ipcMain)
  registerSessionHandlers(ipcMain, mainWindow!)
  registerFileHandlers(ipcMain)
  registerWorktreeHandlers(ipcMain)
  registerGitHubHandlers(ipcMain)
  registerDialogHandlers(ipcMain, mainWindow!)
  registerUpdateHandlers(ipcMain)
  startActivityWatcher(mainWindow!)
  ensurePluginInstalled()

  if (!is.dev) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => log.info('updater', 'Checking for update…'))
    autoUpdater.on('update-available', (info) => {
      log.info('updater', `Update available: ${info.version}`)
      mainWindow?.webContents.send('update-status', {
        status: 'available',
        version: info.version
      })
    })
    autoUpdater.on('update-not-available', (info) =>
      log.info('updater', `Up to date (${info.version})`)
    )
    autoUpdater.on('download-progress', (p) =>
      log.info('updater', `Downloading: ${Math.round(p.percent)}%`)
    )
    autoUpdater.on('update-downloaded', (info) => {
      log.info('updater', `Update downloaded: ${info.version} — will install on quit`)
      mainWindow?.webContents.send('update-status', {
        status: 'ready',
        version: info.version
      })
    })
    autoUpdater.on('error', (err) => {
      log.error('updater', err.message)
      mainWindow?.webContents.send('update-status', {
        status: 'error',
        message: err.message
      })
    })

    autoUpdater.checkForUpdates()
    setInterval(() => autoUpdater.checkForUpdates(), 30 * 60 * 1000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopActivityWatcher()
  killAllTerminals()
  killAllSessions()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
