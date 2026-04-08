import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { PrInfo, IssueInfo, AutoSummarySettings } from '../shared/types'
import { DEFAULT_AUTO_SUMMARY } from '../shared/types'

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
  issue?: IssueInfo
}

export type { AutoSummarySettings }
export { DEFAULT_AUTO_SUMMARY }

export interface PersistedState {
  projects: ProjectData[]
  activeProjectId: string | null
  nextProjectId: number
  sessions: SessionData[]
  activeSessionIndex: number | null
  gridCols?: 1 | 2
  autoSummary?: AutoSummarySettings
}

const DEFAULT_STATE: PersistedState = {
  projects: [],
  activeProjectId: null,
  nextProjectId: 1,
  sessions: [],
  activeSessionIndex: null,
  gridCols: 2,
  autoSummary: DEFAULT_AUTO_SUMMARY
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const rawAuto = parsed.autoSummary
    const autoSummary: AutoSummarySettings = {
      enabled:
        typeof rawAuto?.enabled === 'boolean' ? rawAuto.enabled : DEFAULT_AUTO_SUMMARY.enabled,
      debounceSeconds:
        typeof rawAuto?.debounceSeconds === 'number' && rawAuto.debounceSeconds >= 0
          ? rawAuto.debounceSeconds
          : DEFAULT_AUTO_SUMMARY.debounceSeconds,
      minTurns:
        typeof rawAuto?.minTurns === 'number' && rawAuto.minTurns >= 1
          ? rawAuto.minTurns
          : DEFAULT_AUTO_SUMMARY.minTurns
    }

    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      activeProjectId: parsed.activeProjectId ?? null,
      nextProjectId: typeof parsed.nextProjectId === 'number' ? parsed.nextProjectId : 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      activeSessionIndex: parsed.activeSessionIndex ?? null,
      gridCols: parsed.gridCols === 1 ? 1 : 2,
      autoSummary
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
