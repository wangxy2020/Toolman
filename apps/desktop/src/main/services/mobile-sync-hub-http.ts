import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  SYNC_HUB_TOKEN_HEADER,
  isLoopbackHostname,
  isPrivateOrLoopbackHostname,
  isShortPairingCode,
  isToolmanPublicWebHostname,
  normalizePairingCode,
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

export function allowCorsOrigin(origin: string | null, req?: IncomingMessage): string | null {
  if (!origin) return null
  try {
    const host = new URL(origin).hostname
    if (isLoopbackHostname(host)) return origin
    if (isToolmanPublicWebHostname(host)) return origin
    if (isMobileSyncLanAccessEnabled()) return origin
    if (req && isLoopbackRemoteAddress(req) && isPrivateOrLoopbackHostname(host)) return origin
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
  const origin = allowCorsOrigin(requestOrigin(req), req)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Private-Network': 'true',
    ...extra,
  }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

/** Node HTTP headers are Latin-1; Chinese filenames need RFC 5987 encoding. */
export function contentDispositionAttachment(fileName: string): string {
  const fallback =
    fileName
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'file'
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export function asciiContentType(mimeType: string | null | undefined): string {
  const trimmed = mimeType?.trim() ?? ''
  if (!trimmed || /[^\x20-\x7E]/.test(trimmed)) return 'application/octet-stream'
  return trimmed
}

export function sendJson(res: ServerResponse, status: number, body: unknown, req?: IncomingMessage): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, sendCorsHeaders({
    'Content-Type': 'application/json; charset=utf-8',
  }, req))
  res.end(payload)
}

function latin1HeaderRecord(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key] = value.replace(/[^\t\x20-\x7E]/g, '_')
  }
  return out
}

export function sendBinary(
  res: ServerResponse,
  status: number,
  bytes: Buffer,
  headers: Record<string, string>,
  req?: IncomingMessage,
): void {
  res.writeHead(status, latin1HeaderRecord(sendCorsHeaders({
    ...headers,
    'Content-Length': String(bytes.length),
  }, req)))
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

export function readPresentedCommunityUserId(req: IncomingMessage): string {
  const raw = req.headers['x-community-user-id']
  return typeof raw === 'string' ? raw.trim() : ''
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
  if (isShortPairingCode(expected) || isShortPairingCode(presented)) {
    const left = Buffer.from(normalizePairingCode(presented))
    const right = Buffer.from(normalizePairingCode(expected))
    if (left.length !== right.length || left.length === 0) return false
    return timingSafeEqual(left, right)
  }
  const left = Buffer.from(presented)
  const right = Buffer.from(expected)
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

export function isLoopbackRemoteAddress(req: IncomingMessage): boolean {
  const addr = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
  return addr === '127.0.0.1' || addr === '::1'
}

const pairingFailures = new Map<string, { count: number; resetAt: number }>()

export function notePairingFailure(req: IncomingMessage, max = 12, windowMs = 10 * 60_000): boolean {
  const key = (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '')
  const now = Date.now()
  const current = pairingFailures.get(key)
  if (!current || current.resetAt < now) {
    pairingFailures.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  current.count += 1
  return current.count <= max
}

export function isHubAuthenticated(req: IncomingMessage): boolean {
  // Same-computer preview (Expo web / localhost) talks to 127.0.0.1; never require
  // the pairing code there. LAN / WAN clients still must present the token.
  if (isLoopbackRemoteAddress(req)) return true
  return tokensMatch(readPresentedToken(req), ensureMobileSyncHubToken())
}

export function requireHubAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (isHubAuthenticated(req)) return true
  sendJson(res, 401, { error: 'unauthorized' }, req)
  return false
}

