import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  SYNC_HUB_TOKEN_HEADER,
  isLoopbackHostname,
} from '@toolman/shared'
import {
  ensureMobileSyncHubToken,
  isMobileSyncLanAccessEnabled,
} from './mobile-sync.config'

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function parseJsonBody(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: raw.trim() ? JSON.parse(raw) : {} }
  } catch {
    return { ok: false }
  }
}

export function requestOrigin(req?: IncomingMessage): string | null {
  const origin = req?.headers.origin
  return typeof origin === 'string' && origin.trim() ? origin.trim() : null
}

export function allowCorsOrigin(origin: string | null): string | null {
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

export function sendCorsHeaders(
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

export function sendJson(res: ServerResponse, status: number, body: unknown, req?: IncomingMessage): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, sendCorsHeaders({
    'Content-Type': 'application/json; charset=utf-8',
  }, req))
  res.end(payload)
}

export function sendBinary(
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

export function sendSse(res: ServerResponse, chunks: Array<{ type: string; text?: string; error?: string }>, req?: IncomingMessage): void {
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

export function readPresentedToken(req: IncomingMessage): string {
  const named = req.headers[SYNC_HUB_TOKEN_HEADER.toLowerCase()]
  if (typeof named === 'string' && named.trim()) return named.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return ''
}

export function tokensMatch(presented: string, expected: string): boolean {
  const left = Buffer.from(presented)
  const right = Buffer.from(expected)
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

export function isLoopbackRemoteAddress(req: IncomingMessage): boolean {
  const addr = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
  return addr === '127.0.0.1' || addr === '::1'
}

export function requireHubAuth(req: IncomingMessage, res: ServerResponse): boolean {
  // Same-machine clients can sync without pasting a token while LAN is off.
  if (!isMobileSyncLanAccessEnabled() && isLoopbackRemoteAddress(req)) return true
  const expected = ensureMobileSyncHubToken()
  if (tokensMatch(readPresentedToken(req), expected)) return true
  sendJson(res, 401, { error: 'unauthorized' }, req)
  return false
}

