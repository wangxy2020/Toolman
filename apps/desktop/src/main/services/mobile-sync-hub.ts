/**
 * Local Sync Hub HTTP server (desktop). Implements the Sync API surface used by
 * `@toolman/sync-client` so mobile can push/pull notes + knowledge metadata and
 * invoke desktop host capabilities without a cloud Hub.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AgentHostCapability, AgentHostPresence, SyncChange } from '@toolman/shared'
import { logStructured } from './structured-log.service'
import {
  buildMobileAgentHostPresence,
  handleMobileAgentHostInvoke,
  isMobileAgentHostEnabled,
} from './mobile-agent-host.service'
import { applyInboundSyncChanges } from './mobile-sync-apply'
import { appendSyncChanges, pullSyncChanges } from './mobile-sync-store'
import { isMobileSyncEnabled } from './mobile-sync.service'
import { resolveMobileSyncPort } from './mobile-sync.config'

let server: Server | null = null
let listenPort: number | null = null

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(payload)
}

function sendSse(res: ServerResponse, chunks: Array<{ type: string; text?: string; error?: string }>): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')

  if (method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (method === 'GET' && url.pathname === '/api/v1/sync/hosts') {
    const hosts: AgentHostPresence[] = []
    const presence = buildMobileAgentHostPresence([
      'agent',
      'classroom',
      'project-management',
      'knowledge-search',
    ])
    if (presence) hosts.push(presence)
    sendJson(res, 200, { hosts })
    return
  }

  if (method === 'POST' && url.pathname === '/api/v1/sync/push') {
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}') as { changes?: SyncChange[] }
    const changes = Array.isArray(body.changes) ? body.changes : []
    applyInboundSyncChanges(changes)
    const result = appendSyncChanges(changes)
    sendJson(res, 200, {
      accepted: result.accepted,
      rejected: [],
      serverTime: Date.now(),
    })
    return
  }

  if (method === 'POST' && url.pathname === '/api/v1/sync/pull') {
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}') as { cursor?: string | null; limit?: number }
    const pulled = pullSyncChanges({
      cursor: body.cursor ?? null,
      limit: typeof body.limit === 'number' ? body.limit : 100,
    })
    sendJson(res, 200, {
      changes: pulled.changes,
      nextCursor: pulled.nextCursor,
      serverTime: Date.now(),
    })
    return
  }

  if (method === 'POST' && url.pathname === '/api/v1/sync/hosts/invoke') {
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}') as {
      capability?: AgentHostCapability
      message?: string
      stream?: boolean
    }
    const capability = body.capability ?? 'agent'
    const message = body.message ?? ''
    const result = await handleMobileAgentHostInvoke({ capability, message })
    if (body.stream === false) {
      sendJson(res, 200, result.ok ? { type: 'done', text: result.text } : { type: 'error', error: result.text })
      return
    }
    if (!result.ok) {
      sendSse(res, [{ type: 'error', error: result.text }])
      return
    }
    sendSse(res, [
      { type: 'delta', text: result.text },
      { type: 'done', text: result.text },
    ])
    return
  }

  sendJson(res, 404, { error: 'not found' })
}

export function getMobileSyncHubPort(): number {
  return resolveMobileSyncPort()
}

export function getMobileSyncHubBaseUrl(): string | null {
  if (!listenPort) return null
  return `http://127.0.0.1:${listenPort}`
}

export async function startMobileSyncHub(): Promise<{ baseUrl: string } | null> {
  if (!isMobileSyncEnabled()) return null
  if (server) {
    return { baseUrl: `http://127.0.0.1:${listenPort}` }
  }

  const port = getMobileSyncHubPort()
  server = createServer((req, res) => {
    void handleRequest(req, res).catch((error) => {
      logStructured('mobile-sync', 'warn', `hub request failed: ${String(error)}`)
      sendJson(res, 500, { error: 'internal error' })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(port, '127.0.0.1', () => resolve())
  })
  listenPort = port
  logStructured(
    'mobile-sync',
    'info',
    `local Sync Hub listening at http://127.0.0.1:${port} (agentHost=${isMobileAgentHostEnabled()})`,
  )
  return { baseUrl: `http://127.0.0.1:${port}` }
}

export async function stopMobileSyncHub(): Promise<void> {
  if (!server) return
  const current = server
  server = null
  listenPort = null
  await new Promise<void>((resolve) => current.close(() => resolve()))
}
