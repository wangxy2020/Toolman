import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  P2P_JOIN_INVITE_ANSWER_PATH,
  P2P_JOIN_REGISTER_PATH,
  P2P_MAILBOX_PULL_PATH,
  P2P_MAILBOX_PUT_PATH,
  P2P_MAILBOX_SESSION_PATH,
  SYNC_HUB_SERVICE_NAME,
  SyncPushInputSchema,
  type AgentHostCapability,
  type AgentHostPresence,
} from '@toolman/shared'
import {
  buildMobileAgentHostPresence,
  handleMobileAgentHostInvoke,
  publishActiveKnowledgeMeta,
} from './mobile-agent-host.service'
import { publishActiveP2pGroups } from './group-mobile-sync'
import { applyInboundSyncChanges } from './mobile-sync-apply'
import { appendSyncChanges, pullSyncChanges } from './mobile-sync-store'
import {
  exportMobileKnowledgeSnapshot,
  readMobileSyncKnowledgeFile,
} from './knowledge-mobile-export.service'
import { handleMobileP2pInviteAnswer, handleMobileP2pJoinRegister } from './mobile-p2p-join.service'
import { handleMailboxPull, handleMailboxPut, handleMailboxSession } from './p2p/p2p-mailbox.service'
import {
  parseJsonBody,
  readBody,
  requireHubAuth,
  sendBinary,
  sendCorsHeaders,
  sendJson,
  sendSse,
} from './mobile-sync-hub-http'

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    // Do not advertise desktop guest UUID as identityId — mobile Authing IDs are
    // `ag-…` / `fb-…`, and a mismatch would mark this hub foreign and block sync.
    // LAN sync auth is the pairing token (requireHubAuth), same as pre-0.7.0.
    sendJson(res, 200, {
      status: 'ok',
      service: SYNC_HUB_SERVICE_NAME,
      health: '/health',
      hosts: '/api/v1/sync/hosts',
      p2pJoin: P2P_JOIN_REGISTER_PATH,
      p2pInviteAnswer: P2P_JOIN_INVITE_ANSWER_PATH,
      p2pMailboxPut: P2P_MAILBOX_PUT_PATH,
      p2pMailboxPull: P2P_MAILBOX_PULL_PATH,
    }, req)
    return
  }

  if (method === 'POST' && url.pathname === P2P_JOIN_REGISTER_PATH) {
    const parsed = parseJsonBody(await readBody(req))
    if (!parsed.ok) {
      sendJson(res, 400, { error: 'invalid json' }, req)
      return
    }
    const result = await handleMobileP2pJoinRegister(parsed.value)
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error }, req)
      return
    }
    sendJson(res, 200, result.data, req)
    return
  }

  if (method === 'POST' && url.pathname === P2P_JOIN_INVITE_ANSWER_PATH) {
    const parsed = parseJsonBody(await readBody(req))
    if (!parsed.ok) {
      sendJson(res, 400, { error: 'invalid json' }, req)
      return
    }
    const result = await handleMobileP2pInviteAnswer(parsed.value)
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error }, req)
      return
    }
    sendJson(res, 200, result.data, req)
    return
  }

  if (method === 'POST' && url.pathname === P2P_MAILBOX_PUT_PATH) {
    const parsed = parseJsonBody(await readBody(req))
    if (!parsed.ok) {
      sendJson(res, 400, { error: 'invalid json' }, req)
      return
    }
    const result = await handleMailboxPut(parsed.value)
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error }, req)
      return
    }
    sendJson(res, 200, result.data, req)
    return
  }

  if (method === 'POST' && url.pathname === P2P_MAILBOX_PULL_PATH) {
    const parsed = parseJsonBody(await readBody(req))
    if (!parsed.ok) {
      sendJson(res, 400, { error: 'invalid json' }, req)
      return
    }
    const result = await handleMailboxPull(parsed.value)
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error }, req)
      return
    }
    sendJson(res, 200, result.data, req)
    return
  }

  if (method === 'POST' && url.pathname === P2P_MAILBOX_SESSION_PATH) {
    // Personal device-pairing session authenticates via workspace grant / identity
    // inside handleMailboxSession — do not require the LAN Sync Hub pairing token.
    const parsed = parseJsonBody(await readBody(req))
    if (!parsed.ok) {
      sendJson(res, 400, { error: 'invalid json' }, req)
      return
    }
    const result = await handleMailboxSession(parsed.value)
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error }, req)
      return
    }
    sendJson(res, 200, result.data, req)
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
    publishActiveP2pGroups()
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

