import type { AgentRelayMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { P2pBridge } from './p2p-bridge'
import {
  encodeReplicationMessage,
  type RemoteWorkspaceEventWire,
  type ReplicationMessage,
} from './p2p-sync-protocol'

/** JSON payload budget before encryption; WebRTC SCTP max is ~64KB. */
export const P2P_EVENTS_SAFE_PAYLOAD_BYTES = 48 * 1024

export class P2pEventsPayloadTooLargeError extends Error {
  readonly label: string
  readonly bytes: number
  readonly limit: number

  constructor(label: string, bytes: number, limit: number) {
    super(`P2P events payload too large: ${label} (${bytes} > ${limit})`)
    this.name = 'P2pEventsPayloadTooLargeError'
    this.label = label
    this.bytes = bytes
    this.limit = limit
  }
}

export function measureReplicationMessageBytes(message: ReplicationMessage): number {
  return encodeReplicationMessage(message).length
}

export function measureAgentRelayEnvelopeBytes(relay: AgentRelayMessage): number {
  return measureReplicationMessageBytes({
    type: 'agent-relay.message',
    relay,
  })
}

export function describeReplicationMessage(message: ReplicationMessage): string {
  switch (message.type) {
    case 'events.batch':
      return `events.batch count=${message.events.length}`
    case 'agent-relay.message': {
      const relay = message.relay as { type?: string; event?: { type?: string } }
      if (relay?.type === 'stream' && relay.event?.type) {
        return `agent-relay.stream event=${relay.event.type}`
      }
      return `agent-relay.${relay?.type ?? 'unknown'}`
    }
    case 'snapshot.response':
      return `snapshot.response bytes=${message.snapshot?.stateJson.length ?? 0}`
    default:
      return message.type
  }
}

export function splitWireEventsByPayloadBudget(
  workspaceId: string,
  events: RemoteWorkspaceEventWire[],
  maxBytes: number = P2P_EVENTS_SAFE_PAYLOAD_BYTES,
): RemoteWorkspaceEventWire[][] {
  if (events.length === 0) return []

  const chunks: RemoteWorkspaceEventWire[][] = []
  let current: RemoteWorkspaceEventWire[] = []

  for (const event of events) {
    const candidate = [...current, event]
    const candidateBytes = measureReplicationMessageBytes({
      type: 'events.batch',
      workspaceId,
      events: candidate,
    })

    if (current.length > 0 && candidateBytes > maxBytes) {
      chunks.push(current)
      current = [event]
      continue
    }

    current = candidate
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}

export async function sendReplicationMessageOnEventsChannel(
  peerDeviceId: string,
  message: ReplicationMessage,
): Promise<void> {
  const bytes = measureReplicationMessageBytes(message)
  const label = describeReplicationMessage(message)

  if (bytes > P2P_EVENTS_SAFE_PAYLOAD_BYTES) {
    const error = new P2pEventsPayloadTooLargeError(label, bytes, P2P_EVENTS_SAFE_PAYLOAD_BYTES)
    logStructured('p2p', 'error', `events send rejected (oversize): ${label} bytes=${bytes} limit=${P2P_EVENTS_SAFE_PAYLOAD_BYTES}`)
    throw error
  }

  try {
    await P2pBridge.connectionSend(peerDeviceId, 'events', encodeReplicationMessage(message))
  } catch (error) {
    const errMessage = toErrorMessage(error, String(error))
    logStructured('p2p', 'error', `events send failed: ${label} bytes=${bytes} limit=${P2P_EVENTS_SAFE_PAYLOAD_BYTES} error=${errMessage}`)
    throw error
  }
}

export async function sendAgentRelayOnEventsChannel(
  peerDeviceId: string,
  relay: AgentRelayMessage,
): Promise<void> {
  await sendReplicationMessageOnEventsChannel(peerDeviceId, {
    type: 'agent-relay.message',
    relay,
  })
}

export async function sendEventsBatchChunked(
  peerDeviceId: string,
  workspaceId: string,
  events: RemoteWorkspaceEventWire[],
): Promise<number> {
  if (events.length === 0) return 0

  const chunks = splitWireEventsByPayloadBudget(workspaceId, events)
  for (const chunk of chunks) {
    await sendReplicationMessageOnEventsChannel(peerDeviceId, {
      type: 'events.batch',
      workspaceId,
      events: chunk,
    })
  }
  return events.length
}
