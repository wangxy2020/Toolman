import {
  bytesEqual,
  encryptP2pChannelPayload,
  P2P_EVENTS_CHANNEL,
  P2P_HANDSHAKE_PING,
  P2P_HANDSHAKE_PONG,
  type P2pGroupChatMessage,
} from '@toolman/shared'
import { toArrayBuffer } from './bytes'
import {
  applyShareableEvent,
  applyWal,
  markShareProjectionReplayCaughtUp,
  markShareProjectionReplayDone,
  replayUntilSeq,
  shareProjectionReplayDone,
  toLocalMessage,
} from './groupChatMesh-helpers'
import { emitMeshEvent } from './meshEvents'
import {
  encodeReplicationMessage,
  isGroupChatResource,
  parseReplicationMessage,
  parseWalPayloadFromEvent,
} from './meshCodec'
import { resolveSharePropose } from './sharePropose'
import {
  readLastSeq,
  rememberLastSeq,
  sendEventsJson,
  type LiveMeshSession,
} from './session'

export function applyWorkspaceWireEvents(
  workspaceId: string,
  events: Array<{
    seq: number
    resourceType: string
    resourceId: string
    eventType: string
    payloadJson: string
    timestamp: number
    operatorId?: string
    sourceDeviceId?: string
  }>,
): number {
  const ordered = [...events].sort((a, b) => a.seq - b.seq)
  let applied = 0
  for (const event of ordered) {
    const seen = event.seq <= readLastSeq(workspaceId)
    // Mailbox `sharedAgents` listings are the source of truth on web/mobile.
    // Agent WAL (Deleted / incomplete session_ids) must not prune the sidebar.
    if (event.resourceType === 'Agent') {
      if (!seen) {
        rememberLastSeq(workspaceId, event.seq)
        applied += 1
      }
      continue
    }
    if (!seen) {
      rememberLastSeq(workspaceId, event.seq)
      applied += 1
    } else if (isGroupChatResource(event.resourceType)) {
      continue
    }
    if (isGroupChatResource(event.resourceType)) {
      const wal = parseWalPayloadFromEvent(event.payloadJson)
      if (wal) applyWal(workspaceId, wal)
      continue
    }
    applyShareableEvent(workspaceId, event)
  }
  markShareProjectionReplayCaughtUp(workspaceId)
  return applied
}

async function applyBatch(session: LiveMeshSession, message: Extract<
  NonNullable<ReturnType<typeof parseReplicationMessage>>,
  { type: 'events.batch' }
>): Promise<void> {
  applyWorkspaceWireEvents(session.workspaceId, message.events)
}

export async function handleEventsPlaintext(session: LiveMeshSession, raw: string): Promise<void> {
  const ping = new TextEncoder().encode(raw)
  if (bytesEqual(ping, P2P_HANDSHAKE_PING)) {
    const pong = await encryptP2pChannelPayload({
      workspaceKey: session.workspaceKey,
      workspaceId: session.workspaceId,
      channel: P2P_EVENTS_CHANNEL,
      plaintext: P2P_HANDSHAKE_PONG,
    })
    session.events?.send(toArrayBuffer(pong))
    return
  }

  const parsed = parseReplicationMessage(raw)
  if (!parsed) {
    try {
      const envelope = JSON.parse(raw) as {
        type?: string
        message?: P2pGroupChatMessage
      }
      if (envelope.type === 'group-chat.message' && envelope.message) {
        emitMeshEvent({
          type: 'chat',
          workspaceId: session.workspaceId,
          message: toLocalMessage(envelope.message),
        })
      }
    } catch {
      // ignore
    }
    return
  }

  if (parsed.type === 'agent-relay.message') {
    void import('./agentRelay').then(({ handleIncomingAgentRelay }) => {
      handleIncomingAgentRelay(parsed.relay)
    })
    return
  }
  if (parsed.type === 'group-chat.message' && parsed.message) {
    emitMeshEvent({
      type: 'chat',
      workspaceId: session.workspaceId,
      message: toLocalMessage(parsed.message as P2pGroupChatMessage),
    })
    return
  }
  if (parsed.type === 'group-chat.clear') {
    emitMeshEvent({ type: 'chat-clear', workspaceId: session.workspaceId })
    return
  }
  if (parsed.type === 'sync.hello_ack') {
    const lastSeq = readLastSeq(session.workspaceId)
    const replay = !shareProjectionReplayDone(session.workspaceId)
    const sinceSeq = replay ? 0 : lastSeq
    if (replay) replayUntilSeq.set(session.workspaceId, parsed.latestSeq)
    if (parsed.latestSeq > sinceSeq) {
      await sendEventsJson(
        session.workspaceId,
        encodeReplicationMessage({
          type: 'events.request',
          workspaceId: session.workspaceId,
          sinceSeq,
        }),
      )
    } else if (replay) {
      markShareProjectionReplayDone(session.workspaceId)
      replayUntilSeq.delete(session.workspaceId)
    }
    return
  }
  if (parsed.type === 'events.batch') {
    await applyBatch(session, parsed)
    return
  }
  if (parsed.type === 'events.proposed') {
    resolveSharePropose(parsed.proposalId, true)
    rememberLastSeq(session.workspaceId, parsed.event.seq)
    if (parsed.event.resourceType === 'Agent') return
    if (isGroupChatResource(parsed.event.resourceType)) {
      const wal = parseWalPayloadFromEvent(parsed.event.payloadJson)
      if (wal) applyWal(session.workspaceId, wal)
      return
    }
    applyShareableEvent(session.workspaceId, parsed.event)
    return
  }
  if (parsed.type === 'events.propose_rejected') {
    resolveSharePropose(parsed.proposalId, false, parsed.reason)
  }
}
