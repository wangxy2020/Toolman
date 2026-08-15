/**
 * Local Sync Hub HTTP server (desktop). Implements the Sync API surface used by
 * `@toolman/sync-client` so mobile can push/pull notes, export sync-KB
 * files/chunks/vectors, and invoke desktop host capabilities without a cloud Hub.
 */
import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  SYNC_HUB_SERVICE_NAME,
  SYNC_HUB_TOKEN_HEADER,
  SyncPushInputSchema,
  isLoopbackHostname,
  type AgentHostCapability,
  type AgentHostPresence,
} from '@toolman/shared'
import { logStructured } from './structured-log.service'
import {
  buildMobileAgentHostPresence,
  handleMobileAgentHostInvoke,
  publishActiveKnowledgeMeta,
} from './mobile-agent-host.service'
import { applyInboundSyncChanges } from './mobile-sync-apply'
import { appendSyncChanges, pullSyncChanges } from './mobile-sync-store'
import { isMobileSyncEnabled } from './mobile-sync.service'
import {
  ensureMobileSyncHubToken,
  isMobileSyncLanAccessEnabled,
  resolveMobileSyncListenHost,
  resolveMobileSyncPort,
} from './mobile-sync.config'
import { advertisedHttpUrls } from './network-advertise'
import {
  exportMobileKnowledgeSnapshot,
  readMobileSyncKnowledgeFile,
} from './knowledge-mobile-export.service'

let server: Server | null = null
let listenPort: number | null = null
let listenHost: string | null = null

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function parseJsonBody(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: raw.trim() ? JSON.parse(raw) : {} }
  } catch {
    return { ok: false }
  }
}

function requestOrigin(req?: IncomingMessage): string | null {
  const origin = req?.headers.origin
  return typeof origin === 'string' && origin.trim() ? origin.trim() : null
}

function allowCorsOrigin(origin: string | null): string | null {
  if (!origin) return null
  try {
    const host = new URL(origin).hostname
    if (isLoopbackHostname(host)) return origin
    if (isMobileSyncLanAccessEnabled()) return origin
  } catch {
    return null
  }
  return null
}

function sendCorsHeaders(
  extra: Record<string, string> = {},
  req?: IncomingMessage,
): Record<string, string> {
  const requested = req?.headers['access-control-request-headers']
  const required = `Authorization, Content-Type, Accept, X-Community-User-Id, ${SYNC_HUB_TOKEN_HEADER}`
  const allowHeaders =
    typeof requested === 'string' && requested.trim()
      ? `${requested}, ${required}`
      : required
  const origin = allowCorsOrigin(requestOrigin(req))
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': '86400',
    ...extra,
  }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  if (isMobileSyncLanAccessEnabled()) {
    headers['Access-Control-Allow-Private-Network'] = 'true'
  }
  return headers
}

function sendJson(res: ServerResponse, status: number, body: unknown, req?: IncomingMessage): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, sendCorsHeaders({
    'Content-Type': 'application/json; charset=utf-8',
  }, req))
  res.end(payload)
}

function sendBinary(
  res: ServerResponse,
  status: number,
  bytes: Buffer,
  headers: Record<string, string>,
  req?: IncomingMessage,
): void {
  res.writeHead(status, sendCorsHeaders({
    ...headers,
    'Content-Length': String(bytes.length),
  }, req))
  res.end(bytes)
}

function sendSse(res: ServerResponse, chunks: Array<{ type: string; text?: string; error?: string }>, req?: IncomingMessage): void {
  res.writeHead(200, sendCorsHeaders({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  }, req))
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

function readPresentedToken(req: IncomingMessage): string {
  const named = req.headers[SYNC_HUB_TOKEN_HEADER.toLowerCase()]
  if (typeof named === 'string' && named.trim()) return named.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return ''
}

function tokensMatch(presented: string, expected: string): boolean {
  const left = Buffer.from(presented)
  const right = Buffer.from(expected)
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

function isLoopbackRemoteAddress(req: IncomingMessage): boolean {
  const addr = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
  return addr === '127.0.0.1' || addr === '::1'
}

function requireHubAuth(req: IncomingMessage, res: ServerResponse): boolean {
  // Same-machine clients can sync without pasting a token while LAN is off.
  if (!isMobileSyncLanAccessEnabled() && isLoopbackRemoteAddress(req)) return true
  const expected = ensureMobileSyncHubToken()
  if (tokensMatch(readPresentedToken(req), expected)) return true
  sendJson(res, 401, { error: 'unauthorized' }, req)
  return false
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')

  if (method === 'OPTIONS') {
    res.writeHead(204, sendCorsHeaders({}, req))
    res.end()
    return
  }

  if (
    method === 'GET' &&
    (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/api/v1/health')
  ) {
    sendJson(res, 200, {
      status: 'ok',
      service: SYNC_HUB_SERVICE_NAME,
      health: '/health',
      hosts: '/api/v1/sync/hosts',
    }, req)
    return
  }

  if (!requireHubAuth(req, res)) return

  if (method === 'GET' && url.pathname === '/api/v1/sync/hosts') {
    const hosts: AgentHostPresence[] = []
    const presence = buildMobileAgentHostPresence([
      'agent',
      'classroom',
      'project-management',
      'knowledge-search',
    ])
    if (presence) hosts.push(presence)
    sendJson(res, 200, { hosts }, req)
    return
  }

  if (method === 'POST' && url.pathname === '/api/v1/sync/push') {
    const parsed = parseJsonBody(await readBody(req))
    if (!parsed.ok) {
      sendJson(res, 400, { error: 'invalid json' }, req)
      return
    }
    const input = SyncPushInputSchema.safeParse(parsed.value)
    if (!input.success) {
      sendJson(res, 400, { error: 'invalid push payload' }, req)
      return
    }
    applyInboundSyncChanges(input.data.changes)
    const result = appendSyncChanges(input.data.changes)
    sendJson(res, 200, {
      accepted: result.accepted,
      rejected: [],
      serverTime: Date.now(),
    }, req)
    return
  }

  if (method === 'POST' && url.pathname === '/api/v1/sync/pull') {
    const parsed = parseJsonBody(await readBody(req))
    if (!parsed.ok) {
      sendJson(res, 400, { error: 'invalid json' }, req)
      return
    }
    const body = parsed.value as { cursor?: string | null; limit?: number }
    publishActiveKnowledgeMeta()
    const pulled = pullSyncChanges({
      cursor: body.cursor ?? null,
      limit: typeof body.limit === 'number' ? body.limit : 100,
    })
    sendJson(res, 200, {
      changes: pulled.changes,
      nextCursor: pulled.nextCursor,
      hasMore: pulled.hasMore,
      serverTime: Date.now(),
    }, req)
    return
  }

  if (method === 'GET' && url.pathname === '/api/v1/sync/knowledge/export') {
    const sinceRaw = Number.parseInt(url.searchParams.get('since') ?? '', 10)
    const snapshot = await exportMobileKnowledgeSnapshot({
      since: Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : undefined,
    })
    sendJson(res, 200, snapshot, req)
    return
  }

  if (method === 'GET' && url.pathname === '/api/v1/sync/knowledge/files') {
    const kbId = url.searchParams.get('kbId') ?? ''
    const documentId = url.searchParams.get('documentId') ?? ''
    if (!kbId || !documentId) {
      sendJson(res, 400, { error: 'kbId and documentId required' }, req)
      return
    }
    const file = readMobileSyncKnowledgeFile({ kbId, documentId })
    if (!file) {
      sendJson(res, 404, { error: 'file not found' }, req)
      return
    }
    const safeName = file.fileName.replace(/["\r\n]/g, '_')
    sendBinary(res, 200, file.bytes, {
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    }, req)
    return
  }

  if (method === 'POST' && url.pathname === '/api/v1/sync/hosts/invoke') {
    const parsed = parseJsonBody(await readBody(req))
    if (!parsed.ok) {
      sendJson(res, 400, { error: 'invalid json' }, req)
      return
    }
    const body = parsed.value as {
      capability?: AgentHostCapability
      message?: string
      stream?: boolean
    }
    const capability = body.capability ?? 'agent'
    const message = body.message ?? ''
    const result = await handleMobileAgentHostInvoke({ capability, message })
    if (body.stream === false) {
      sendJson(res, 200, result.ok ? { type: 'done', text: result.text } : { type: 'error', error: result.text }, req)
      return
    }
    if (!result.ok) {
      sendSse(res, [{ type: 'error', error: result.text }], req)
      return
    }
    sendSse(res, [
      { type: 'delta', text: result.text },
      { type: 'done', text: result.text },
    ], req)
    return
  }

  sendJson(res, 404, { error: 'not found' }, req)
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
  const host = resolveMobileSyncListenHost()
  const port = getMobileSyncHubPort()
  if (server && listenHost === host && listenPort === port) {
    return { baseUrl: `http://127.0.0.1:${listenPort}` }
  }
  if (server) await stopMobileSyncHub()

  ensureMobileSyncHubToken()
  server = createServer((req, res) => {
    void handleRequest(req, res).catch((error) => {
      logStructured('mobile-sync', 'warn', `hub request failed: ${String(error)}`)
      sendJson(res, 500, { error: 'internal error' }, req)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(port, host, () => resolve())
  })
  listenPort = port
  listenHost = host
  const urls = isMobileSyncLanAccessEnabled()
    ? advertisedHttpUrls(port)
    : [`http://127.0.0.1:${port}`]
  logStructured('mobile-sync', 'warn', `Sync Hub listening: ${urls.join(', ')}`)
  return { baseUrl: `http://127.0.0.1:${port}` }
}

export async function stopMobileSyncHub(): Promise<void> {
  if (!server) return
  const current = server
  server = null
  listenPort = null
  listenHost = null
  await new Promise<void>((resolve) => current.close(() => resolve()))
}
