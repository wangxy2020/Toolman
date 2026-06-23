import {
  buildGroupChatRelayExcludeDeviceIds,
  shouldRelayGroupChatAfterReceive,
} from './p2p-group-chat-relay'

export type GroupChatMeshTopology = 'full_mesh' | 'owner_star' | 'chain'

export interface GroupChatMeshSimulationInput {
  memberDeviceIds: readonly string[]
  ownerDeviceId: string
  senderDeviceId: string
  messageId: string
  /** Undirected P2P adjacency (device pairs with active connection). */
  connections: ReadonlySet<string>
  ownerPeerConnected: boolean
}

export interface GroupChatMeshSimulationResult {
  deliveredTo: string[]
  undelivered: string[]
  relayRounds: number
}

function connectionKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function isPairConnected(
  connections: ReadonlySet<string>,
  left: string,
  right: string,
): boolean {
  if (left === right) return false
  return connections.has(connectionKey(left, right))
}

export function buildTopologyConnections(input: {
  memberDeviceIds: readonly string[]
  ownerDeviceId: string
  topology: GroupChatMeshTopology
}): Set<string> {
  const ids = [...new Set(input.memberDeviceIds)]
  const edges = new Set<string>()
  const connect = (a: string, b: string) => {
    if (a !== b) edges.add(connectionKey(a, b))
  }

  if (input.topology === 'full_mesh') {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        connect(ids[i], ids[j])
      }
    }
    return edges
  }

  if (input.topology === 'owner_star') {
    for (const id of ids) {
      if (id !== input.ownerDeviceId) {
        connect(input.ownerDeviceId, id)
      }
    }
    return edges
  }

  const ordered = [input.ownerDeviceId, ...ids.filter((id) => id !== input.ownerDeviceId)]
  for (let i = 0; i < ordered.length - 1; i += 1) {
    connect(ordered[i], ordered[i + 1])
  }
  return edges
}

/**
 * Simulates group-chat gossip: direct send from sender + receive-side relay
 * (owner hub when online, member mesh when owner offline).
 */
export function simulateGroupChatMeshDelivery(
  input: GroupChatMeshSimulationInput,
): GroupChatMeshSimulationResult {
  const members = new Set(input.memberDeviceIds)
  if (!members.has(input.senderDeviceId)) {
    return { deliveredTo: [], undelivered: [...members], relayRounds: 0 }
  }

  const received = new Map<string, string>()
  const queue: Array<{ deviceId: string; fromDeviceId: string }> = []

  const enqueueDirectFromSender = () => {
    for (const peerDeviceId of members) {
      if (peerDeviceId === input.senderDeviceId) continue
      if (!isPairConnected(input.connections, input.senderDeviceId, peerDeviceId)) continue
      if (received.has(peerDeviceId)) continue
      received.set(peerDeviceId, input.senderDeviceId)
      queue.push({ deviceId: peerDeviceId, fromDeviceId: input.senderDeviceId })
    }
  }

  enqueueDirectFromSender()

  let relayRounds = 0
  while (queue.length > 0) {
    relayRounds += 1
    const batch = queue.splice(0, queue.length)
    for (const item of batch) {
      if (
        !shouldRelayGroupChatAfterReceive({
          localDeviceId: item.deviceId,
          ownerDeviceId: input.ownerDeviceId,
          senderDeviceId: item.fromDeviceId,
          ownerPeerConnected: input.ownerPeerConnected,
        })
      ) {
        continue
      }

      const exclude = buildGroupChatRelayExcludeDeviceIds(item.deviceId, item.fromDeviceId)
      for (const peerDeviceId of members) {
        if (exclude.has(peerDeviceId)) continue
        if (!isPairConnected(input.connections, item.deviceId, peerDeviceId)) continue
        if (received.has(peerDeviceId)) continue
        received.set(peerDeviceId, item.deviceId)
        queue.push({ deviceId: peerDeviceId, fromDeviceId: item.deviceId })
      }
    }
  }

  const deliveredTo = [...received.keys()].sort()
  const undelivered = [...members]
    .filter((id) => id !== input.senderDeviceId && !received.has(id))
    .sort()

  return { deliveredTo, undelivered, relayRounds }
}

export function memberDeviceIdsForCount(count: number, ownerDeviceId = 'owner'): string[] {
  const safeCount = Math.max(1, Math.min(count, 10))
  const ids = [ownerDeviceId]
  for (let i = 1; i < safeCount; i += 1) {
    ids.push(`member-${String(i).padStart(2, '0')}`)
  }
  return ids
}
