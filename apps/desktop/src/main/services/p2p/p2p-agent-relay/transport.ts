import { logStructured } from '../../structured-log.service'
import {
  AgentRelayMessageSchema,
  type AgentRelayMessage,
  type Message,
  type MessageStreamEvent,
} from '@toolman/shared'
import { ensurePeerReadyForWorkspace } from '../p2p-connection.service'
import {
  measureAgentRelayEnvelopeBytes,
  P2P_EVENTS_SAFE_PAYLOAD_BYTES,
  sendAgentRelayOnEventsChannel,
} from '../p2p-events-channel'

export function parseRelayMessage(data: Buffer): AgentRelayMessage {
  return AgentRelayMessageSchema.parse(JSON.parse(data.toString('utf8')))
}

export async function sendRelayMessage(
  peerDeviceId: string,
  message: AgentRelayMessage,
): Promise<void> {
  await sendAgentRelayOnEventsChannel(peerDeviceId, message)
}

export function slimStreamEventForRelay(
  event: MessageStreamEvent,
  requestId: string,
): MessageStreamEvent {
  const bytes = measureAgentRelayEnvelopeBytes({
    v: 1,
    type: 'stream',
    requestId,
    event,
  })
  if (bytes <= P2P_EVENTS_SAFE_PAYLOAD_BYTES) return event

  if (event.type === 'message.done' && event.contentBlocks) {
    logStructured('p2p', 'warn', `agent relay stream trimmed: event=message.done bytes=${bytes} limit=${P2P_EVENTS_SAFE_PAYLOAD_BYTES}`)
    return { ...event, contentBlocks: undefined }
  }

  logStructured('p2p', 'warn', `agent relay stream oversize: event=${event.type} bytes=${bytes} limit=${P2P_EVENTS_SAFE_PAYLOAD_BYTES}`)
  return event
}

export function splitFetchOkParts(
  requestId: string,
  title: string,
  messages: Message[],
): Extract<AgentRelayMessage, { type: 'fetch_ok_part' }>[] {
  const chunks: Message[][] = []
  let current: Message[] = []

  for (const message of messages) {
    const candidate = [...current, message]
    const probe: AgentRelayMessage = {
      v: 1,
      type: 'fetch_ok_part',
      requestId,
      partIndex: chunks.length,
      partCount: 1,
      title: chunks.length === 0 ? title : undefined,
      messages: candidate,
    }
    if (
      current.length > 0 &&
      measureAgentRelayEnvelopeBytes(probe) > P2P_EVENTS_SAFE_PAYLOAD_BYTES
    ) {
      chunks.push(current)
      current = [message]
    } else {
      current = candidate
    }
  }

  if (current.length > 0) {
    chunks.push(current)
  }
  if (chunks.length === 0) {
    chunks.push([])
  }

  const partCount = chunks.length
  return chunks.map((chunk, index) => ({
    v: 1,
    type: 'fetch_ok_part' as const,
    requestId,
    partIndex: index,
    partCount,
    title: index === 0 ? title : undefined,
    messages: chunk,
  }))
}

export async function sendFetchOkResponse(
  peerDeviceId: string,
  requestId: string,
  title: string,
  messages: Message[],
): Promise<void> {
  const single: AgentRelayMessage = {
    v: 1,
    type: 'fetch_ok',
    requestId,
    title,
    messages,
  }
  if (measureAgentRelayEnvelopeBytes(single) <= P2P_EVENTS_SAFE_PAYLOAD_BYTES) {
    await sendRelayMessage(peerDeviceId, single)
    return
  }

  const parts = splitFetchOkParts(requestId, title, messages)
  logStructured('p2p', 'warn', `agent relay fetch_ok chunked: requestId=${requestId} messages=${messages.length} parts=${parts.length}`)
  for (const part of parts) {
    await sendRelayMessage(peerDeviceId, part)
  }
}

export async function ensurePeerConnected(peerDeviceId: string, p2pWorkspaceId: string): Promise<void> {
  await ensurePeerReadyForWorkspace(peerDeviceId, p2pWorkspaceId)
}
