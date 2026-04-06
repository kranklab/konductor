import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { PrInfo } from '../shared/types'

const STORE_DIR = join(homedir(), '.konductor')
const STATE_FILE = join(STORE_DIR, 'state.json')

export interface ProjectData {
  id: string
  name: string
  cwd: string
  envScript?: string
}

export interface SessionData {
  projectId: string
  cwd: string
  title: string
  summary: string
  claudeSessionId: string
  pr?: PrInfo
}

export interface PersistedState {
  projects: ProjectData[]
  activeProjectId: string | null
  nextProjectId: number
  sessions: SessionData[]
  activeSessionIndex: number | null
  gridCols?: 1 | 2
}

const DEFAULT_STATE: PersistedState = {
  projects: [],
  activeProjectId: null,
  nextProjectId: 1,
  sessions: [],
  activeSessionIndex: null,
  gridCols: 2
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      activeProjectId: parsed.activeProjectId ?? null,
      nextProjectId: typeof parsed.nextProjectId === 'number' ? parsed.nextProjectId : 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      activeSessionIndex: parsed.activeSessionIndex ?? null,
      gridCols: parsed.gridCols === 1 ? 1 : 2
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true })
  const tmp = STATE_FILE + '.tmp'
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8')
  await rename(tmp, STATE_FILE)
}
