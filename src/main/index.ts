import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}
import { execFile } from 'child_process'
import { join } from 'path'
import { readFile } from 'fs/promises'
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
  getSessionChanges
} from './sessionManager'
import { loadState, saveState, type PersistedState } from './store'
import {
  listWorktrees,
  createWorktree,
  removeWorktree,
  listBranches,
  getBranchDetails,
  deleteBranch,
  deleteRemoteBranch,
  fetchPrune
} from './worktree'

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kranklab.konductor')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- IPC Handlers ---

  ipcMain.handle('load-state', () => {
    return loadState()
  })

  ipcMain.handle('save-state', (_event, state: PersistedState) => {
    return saveState(state)
  })

  ipcMain.handle(
    'create-session',
    (_event, cwd: string, opts?: { claudeSessionId?: string; name?: string; resume?: boolean }) => {
      if (!mainWindow) throw new Error('No main window')
      return createSession(cwd, mainWindow, opts)
    }
  )

  ipcMain.on('write-to-session', (_event, sessionId: string, data: string) => {
    writeToSession(sessionId, data)
  })

  ipcMain.on('resize-session', (_event, sessionId: string, cols: number, rows: number) => {
    resizeSession(sessionId, cols, rows)
  })

  ipcMain.on('kill-session', (_event, sessionId: string) => {
    killSession(sessionId)
  })

  ipcMain.handle('list-sessions', () => {
    return listSessions()
  })

  ipcMain.handle('get-scrollback', (_event, sessionId: string) => {
    return getSessionScrollback(sessionId)
  })

  ipcMain.handle('get-changes', (_event, sessionId: string) => {
    return getSessionChanges(sessionId)
  })

  ipcMain.handle('read-file', async (_event, filePath: string) => {
    const content = await readFile(filePath, 'utf-8')
    return content
  })

  ipcMain.handle('get-diff', (_event, cwd: string, filePath: string, isUntracked: boolean) => {
    return new Promise<string>((resolve) => {
      if (isUntracked) {
        // Untracked files: diff against empty to show all lines as added
        execFile(
          'git',
          ['diff', '--no-index', '--', '/dev/null', filePath],
          { cwd },
          (_err, stdout) => {
            resolve(stdout || '')
          }
        )
      } else {
        // Tracked files: diff working tree + staged against HEAD
        execFile('git', ['diff', 'HEAD', '--', filePath], { cwd }, (err, stdout) => {
          if (err && !stdout) {
            resolve('')
            return
          }
          resolve(stdout || '')
        })
      }
    })
  })

  ipcMain.handle('list-worktrees', (_event, cwd: string) => {
    return listWorktrees(cwd)
  })

  ipcMain.handle('create-worktree', (_event, cwd: string, branch: string, newBranch: boolean) => {
    return createWorktree(cwd, branch, newBranch)
  })

  ipcMain.handle('list-branches', (_event, cwd: string) => {
    return listBranches(cwd)
  })

  ipcMain.handle('get-branch-details', (_event, cwd: string) => {
    return getBranchDetails(cwd)
  })

  ipcMain.handle('delete-branch', (_event, cwd: string, branch: string, force: boolean) => {
    return deleteBranch(cwd, branch, force)
  })

  ipcMain.handle('delete-remote-branch', (_event, cwd: string, remote: string, branch: string) => {
    return deleteRemoteBranch(cwd, remote, branch)
  })

  ipcMain.handle('fetch-prune', (_event, cwd: string) => {
    return fetchPrune(cwd)
  })

  ipcMain.handle('remove-worktree', (_event, repoRoot: string, worktreePath: string) => {
    return removeWorktree(repoRoot, worktreePath)
  })

  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  createWindow()

  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllSessions()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
