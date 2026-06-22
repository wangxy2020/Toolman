import { randomUUID } from 'node:crypto'
import type { WorkspaceEvent } from '@toolman/shared'
import { ensurePeerReadyForWorkspace } from './p2p-connection.service'
import type { AppendP2pEventInput } from './p2p-event.service'
import {
  applySequencingToAppend,
  getWorkspaceOwnerDeviceId,
} from './p2p-sync-sequencing'
import { getKnownP2pConnections } from './p2p-connection.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { sendReplicationMessageOnEventsChannel } from './p2p-events-channel'
import { workspaceEventToWire, type ReplicationMessage } from './p2p-sync-protocol'

const PROPOSAL_TIMEOUT_MS = 20_000

async function sendReplicationMessage(
  peerDeviceId: string,
  message: ReplicationMessage,
): Promise<void> {
  await sendReplicationMessageOnEventsChannel(peerDeviceId, message)
}

interface PendingProposal {
  resolve: (event: WorkspaceEvent) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingProposals = new Map<string, PendingProposal>()

export function resolveP2pEventProposal(proposalId: string, event: WorkspaceEvent): void {
  const pending = pendingProposals.get(proposalId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingProposals.delete(proposalId)
  pending.resolve(event)
}

export function rejectP2pEventProposal(proposalId: string, reason: string): void {
  const pending = pendingProposals.get(proposalId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingProposals.delete(proposalId)
  pending.reject(new Error(reason))
}

export async function proposeP2pEventToOwner(input: AppendP2pEventInput): Promise<WorkspaceEvent> {
  const ownerDeviceId = getWorkspaceOwnerDeviceId(input.workspaceId)
  if (!ownerDeviceId) {
    throw new Error('群主不存在，暂无法写入群组事件')
  }

  await ensurePeerReadyForWorkspace(ownerDeviceId, input.workspaceId)

  const device = getP2pDeviceInfo()
  const connections = getKnownP2pConnections()
  const sequenced = applySequencingToAppend(
    input.workspaceId,
    input.payload,
    input.timestamp,
    connections,
  )
  const proposalId = randomUUID()

  const eventPromise = new Promise<WorkspaceEvent>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingProposals.delete(proposalId)
      reject(new Error('向群主提交事件超时'))
    }, PROPOSAL_TIMEOUT_MS)
    pendingProposals.set(proposalId, { resolve, reject, timer })
  })

  await sendReplicationMessage(ownerDeviceId, {
    type: 'events.propose',
    workspaceId: input.workspaceId,
    proposalId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    operatorId: input.operatorId,
    eventType: input.eventType,
    payloadJson: JSON.stringify(sequenced.payload),
    sourceDeviceId: device.deviceId,
    timestamp: sequenced.timestamp,
  })

  return eventPromise
}

export async function handleRemoteEventProposal(
  proposerDeviceId: string,
  message: {
    workspaceId: string
    proposalId: string
    resourceType: AppendP2pEventInput['resourceType']
    resourceId: string
    operatorId: string
    eventType: AppendP2pEventInput['eventType']
    payloadJson: string
    sourceDeviceId: string
    timestamp: number
  },
  appendLocally: (input: AppendP2pEventInput) => Promise<WorkspaceEvent>,
): Promise<void> {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(message.payloadJson) as Record<string, unknown>
  } catch {
    await sendReplicationMessage(proposerDeviceId, {
      type: 'events.propose_rejected',
      workspaceId: message.workspaceId,
      proposalId: message.proposalId,
      reason: '事件载荷无效',
    })
    return
  }

  try {
    const event = await appendLocally({
      workspaceId: message.workspaceId,
      resourceType: message.resourceType,
      resourceId: message.resourceId,
      operatorId: message.operatorId,
      eventType: message.eventType,
      payload,
      timestamp: message.timestamp,
    })

    await sendReplicationMessage(proposerDeviceId, {
      type: 'events.proposed',
      workspaceId: message.workspaceId,
      proposalId: message.proposalId,
      event: workspaceEventToWire(event),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : '群主写入事件失败'
    await sendReplicationMessage(proposerDeviceId, {
      type: 'events.propose_rejected',
      workspaceId: message.workspaceId,
      proposalId: message.proposalId,
      reason,
    })
  }
}

export function handleRemoteEventProposed(message: {
  proposalId: string
  event: ReturnType<typeof workspaceEventToWire>
}): void {
  resolveP2pEventProposal(message.proposalId, {
    eventId: message.event.eventId,
    workspaceId: message.event.workspaceId,
    seq: message.event.seq,
    resourceType: message.event.resourceType,
    resourceId: message.event.resourceId,
    operatorId: message.event.operatorId,
    eventType: message.event.eventType,
    payload: JSON.parse(message.event.payloadJson) as Record<string, unknown>,
    timestamp: message.event.timestamp,
    sourceDeviceId: message.event.sourceDeviceId,
  })
}

export function handleRemoteEventProposalRejected(message: {
  proposalId: string
  reason: string
}): void {
  rejectP2pEventProposal(message.proposalId, message.reason)
}
