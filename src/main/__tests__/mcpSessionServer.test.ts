import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import { readdir, readFile, rm, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const SERVER_PATH = join(__dirname, '../../../claude-code-plugin/mcp/session-server.mjs')

let stateDir: string
let requestDir: string

beforeEach(async () => {
  stateDir = join(tmpdir(), `konductor-mcp-test-${randomUUID()}`)
  requestDir = join(stateDir, 'session-requests')
  await mkdir(stateDir, { recursive: true })
})

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true })
})

/** Spawn the MCP server, send a single JSON-RPC message, and return the parsed response. */
function callServer(message: unknown, env?: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn('node', [SERVER_PATH], {
      env: { ...process.env, KONDUCTOR_STATE_DIR: stateDir, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    proc.stdout!.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    proc.stdin!.write(JSON.stringify(message) + '\n')
    // Close stdin so the server exits after processing
    proc.stdin!.end()

    proc.on('close', () => {
      try {
        const lines = stdout.trim().split('\n').filter(Boolean)
        if (lines.length === 0) {
          resolve(null)
        } else {
          resolve(JSON.parse(lines[lines.length - 1]))
        }
      } catch {
        reject(new Error(`Failed to parse server output: ${stdout}`))
      }
    })

    proc.on('error', reject)

    // Safety timeout
    setTimeout(() => {
      proc.kill()
      reject(new Error('Server timed out'))
    }, 5000)
  })
}

// ─── initialize ──────────────────────────────────────────────────────

describe('initialize', () => {
  it('returns server info and capabilities', async () => {
    const result = await callServer({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' }
      }
    })

    expect(result).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'konductor-session', version: '0.1.0' }
      }
    })
  })
})

// ─── tools/list ──────────────────────────────────────────────────────

describe('tools/list', () => {
  it('lists the start_session tool with plan and branch params', async () => {
    const result = (await callServer({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })) as { result: { tools: Array<{ name: string; inputSchema: unknown }> } }

    expect(result.result.tools).toHaveLength(1)
    const tool = result.result.tools[0]
    expect(tool.name).toBe('start_session')

    const schema = tool.inputSchema as {
      properties: Record<string, unknown>
      required: string[]
    }
    expect(schema.properties).toHaveProperty('plan')
    expect(schema.properties).toHaveProperty('branch')
    expect(schema.required).toEqual(['plan'])
  })
})

// ─── tools/call — start_session ──────────────────────────────────────

describe('tools/call — start_session', () => {
  it('writes a request file and returns success', async () => {
    const result = (await callServer({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'start_session',
        arguments: { plan: 'Fix the login bug' }
      }
    })) as { result: { content: Array<{ type: string; text: string }>; isError?: boolean } }

    expect(result.result.isError).toBeUndefined()
    expect(result.result.content[0].text).toContain('Fix the login bug')

    // Verify request file was written
    const files = await readdir(requestDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/\.json$/)

    const request = JSON.parse(await readFile(join(requestDir, files[0]), 'utf-8'))
    expect(request).toMatchObject({
      type: 'start_session',
      plan: 'Fix the login bug'
    })
    expect(request.cwd).toBeTruthy()
    expect(request.id).toBeTruthy()
    expect(request.timestamp).toBeTruthy()
    expect(request.branch).toBeUndefined()
  })

  it('includes branch in request file when provided', async () => {
    const result = (await callServer({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'start_session',
        arguments: { plan: 'Add dark mode', branch: 'feature/dark-mode' }
      }
    })) as { result: { content: Array<{ type: string; text: string }> } }

    expect(result.result.content[0].text).toContain('feature/dark-mode')

    const files = await readdir(requestDir)
    const request = JSON.parse(await readFile(join(requestDir, files[0]), 'utf-8'))
    expect(request.branch).toBe('feature/dark-mode')
  })

  it('returns error when plan is missing', async () => {
    const result = (await callServer({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'start_session',
        arguments: {}
      }
    })) as { result: { content: Array<{ text: string }>; isError: boolean } }

    expect(result.result.isError).toBe(true)
    expect(result.result.content[0].text).toContain('plan')
  })

  it('returns error when KONDUCTOR_STATE_DIR is not set', async () => {
    const result = (await callServer(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'start_session',
          arguments: { plan: 'Some plan' }
        }
      },
      { KONDUCTOR_STATE_DIR: '' }
    )) as { result: { content: Array<{ text: string }>; isError: boolean } }

    expect(result.result.isError).toBe(true)
    expect(result.result.content[0].text).toContain('KONDUCTOR_STATE_DIR')
  })
})

// ─── Unknown method ──────────────────────────────────────────────────

describe('error handling', () => {
  it('returns method-not-found for unknown methods', async () => {
    const result = (await callServer({
      jsonrpc: '2.0',
      id: 7,
      method: 'unknown/method',
      params: {}
    })) as { error: { code: number; message: string } }

    expect(result.error.code).toBe(-32601)
    expect(result.error.message).toContain('unknown/method')
  })

  it('returns error for unknown tool name', async () => {
    const result = (await callServer({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'nonexistent_tool',
        arguments: {}
      }
    })) as { error: { code: number; message: string } }

    expect(result.error.code).toBe(-32602)
    expect(result.error.message).toContain('nonexistent_tool')
  })

  it('silently ignores notifications (no id)', async () => {
    const result = await callServer({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    })

    // Notifications have no id, so server should not respond
    expect(result).toBeNull()
  })
})
