import type { P2pReplicationTopology } from './types.js'
import { extractLamportFromPayload } from './mesh-replication-lamport.js'

export type SeqSlotConflictResolution = 'skip' | 'replace' | 'reject'

export interface MeshPeerSyncCandidate {
  deviceId: string
  connected: boolean
  lastReceivedSeq: number
  lastSentSeq: number
}

export interface SeqSlotConflictContext {
  ownerDeviceId: string | null
  localDeviceId: string
  existingSourceDeviceId: string
  incomingSourceDeviceId: string
  existingPayload: Record<string, unknown>
  incomingPayload: Record<string, unknown>
  existingSynced: boolean
}

export function resolveReplicationTopology(input: {
  ownerOnline: boolean
  meshPeersConnected: number
}): P2pReplicationTopology {
  if (input.ownerOnline) return 'owner_star'
  if (input.meshPeersConnected > 0) return 'member_mesh'
  return 'offline'
}

/** Prefer connected peers that are most likely ahead of local seq. */
export function orderMeshCatchUpPeers(
  localLatestSeq: number,
  peers: MeshPeerSyncCandidate[],
): string[] {
  return peers
    .filter((peer) => peer.connected)
    .sort((left, right) => {
      const leftLead = Math.max(left.lastSentSeq, left.lastReceivedSeq) - localLatestSeq
      const rightLead = Math.max(right.lastSentSeq, right.lastReceivedSeq) - localLatestSeq
      if (rightLead !== leftLead) return rightLead - leftLead
      return left.deviceId.localeCompare(right.deviceId)
    })
    .map((peer) => peer.deviceId)
}

export function resolveSeqSlotConflict(ctx: SeqSlotConflictContext): SeqSlotConflictResolution {
  if (
    ctx.ownerDeviceId &&
    ctx.ownerDeviceId === ctx.localDeviceId &&
    ctx.existingSourceDeviceId === ctx.localDeviceId &&
    ctx.incomingSourceDeviceId !== ctx.ownerDeviceId
  ) {
    return 'skip'
  }

  if (ctx.ownerDeviceId && ctx.incomingSourceDeviceId === ctx.ownerDeviceId) {
    return 'replace'
  }

  if (!ctx.existingSynced && ctx.existingSourceDeviceId === ctx.localDeviceId) {
    return 'replace'
  }

  const existingLamport = extractLamportFromPayload(ctx.existingPayload)
  const incomingLamport = extractLamportFromPayload(ctx.incomingPayload)
  if (existingLamport !== undefined && incomingLamport !== undefined) {
    if (incomingLamport > existingLamport) return 'replace'
    if (incomingLamport < existingLamport) return 'reject'
    return ctx.incomingSourceDeviceId > ctx.existingSourceDeviceId ? 'replace' : 'reject'
  }

  return 'reject'
}

export function replicationTopologyLabel(topology: P2pReplicationTopology): string {
  switch (topology) {
    case 'owner_star':
      return '群主星型同步'
    case 'member_mesh':
      return '成员网状复制'
    case 'offline':
      return '离线（无可用同步源）'
  }
}
