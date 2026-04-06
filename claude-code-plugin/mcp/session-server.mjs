#!/usr/bin/env node
// Konductor MCP server — exposes session management tools to Claude Code.
// Communicates with the Konductor Electron app via request files written
// to $KONDUCTOR_STATE_DIR/session-requests/.

import { createInterface } from 'readline'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const STATE_DIR = process.env.KONDUCTOR_STATE_DIR
const REQUEST_DIR = STATE_DIR ? join(STATE_DIR, 'session-requests') : null

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function handleMessage(msg) {
  // Notifications have no id — no response needed
  if (msg.id === undefined) return

  switch (msg.method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'konductor-session', version: '0.1.0' }
        }
      })
      break

    case 'tools/list':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            {
              name: 'start_session',
              description:
                'Start a new Konductor Claude Code session in the same project. ' +
                'The session opens in the Konductor UI with the given plan as its initial prompt. ' +
                'Optionally creates a new git worktree branch for the session.',
              inputSchema: {
                type: 'object',
                properties: {
                  plan: {
                    type: 'string',
                    description: 'The plan or prompt for the new session to work on'
                  },
                  branch: {
                    type: 'string',
                    description:
                      'Optional git branch name. When provided, a new worktree is created ' +
                      'for this branch and the session runs inside it. When omitted, the ' +
                      'session runs in the current working directory.'
                  }
                },
                required: ['plan']
              }
            }
          ]
        }
      })
      break

    case 'tools/call':
      handleToolCall(msg)
      break

    default:
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` }
      })
  }
}

function handleToolCall(msg) {
  const { name, arguments: args } = msg.params

  if (name !== 'start_session') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32602, message: `Unknown tool: ${name}` }
    })
    return
  }

  if (!STATE_DIR || !REQUEST_DIR) {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        content: [
          {
            type: 'text',
            text: 'Error: KONDUCTOR_STATE_DIR is not set. This tool only works inside a Konductor-managed session.'
          }
        ],
        isError: true
      }
    })
    return
  }

  const plan = args?.plan
  if (!plan) {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        content: [{ type: 'text', text: 'Error: "plan" argument is required.' }],
        isError: true
      }
    })
    return
  }

  const branch = args?.branch || undefined

  mkdirSync(REQUEST_DIR, { recursive: true })

  const requestId = randomUUID()
  const request = {
    id: requestId,
    type: 'start_session',
    cwd: process.cwd(),
    plan,
    branch,
    timestamp: new Date().toISOString()
  }

  writeFileSync(join(REQUEST_DIR, `${requestId}.json`), JSON.stringify(request))

  const detail = branch
    ? `New session requested on branch "${branch}". A worktree will be created and the session will appear in the Konductor UI with plan:\n${plan}`
    : `New session requested. It will appear in the Konductor UI momentarily with plan:\n${plan}`

  send({
    jsonrpc: '2.0',
    id: msg.id,
    result: {
      content: [{ type: 'text', text: detail }]
    }
  })
}

// ─── stdio transport: newline-delimited JSON-RPC ─────────────────────

const rl = createInterface({ input: process.stdin, terminal: false })

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  try {
    handleMessage(JSON.parse(trimmed))
  } catch {
    // Ignore malformed input
  }
})
