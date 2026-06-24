import type { GroupChatMeshTopology } from './p2p-group-chat-mesh-simulation'
import { buildTopologyConnections } from './p2p-group-chat-mesh-simulation'

/**
 * WAN NAT star: members only reach each other through TURN relay paths.
 * After ICE/TURN negotiation succeeds, WebRTC data channels form a logical full mesh.
 */
export function buildWanTurnAssumedConnections(input: {
  memberDeviceIds: readonly string[]
  ownerDeviceId: string
}): Set<string> {
  return buildTopologyConnections({
    memberDeviceIds: input.memberDeviceIds,
    ownerDeviceId: input.ownerDeviceId,
    topology: 'full_mesh',
  })
}

export function buildWanNatStarPhysicalConnections(input: {
  memberDeviceIds: readonly string[]
  relayId?: string
}): Set<string> {
  const relay = input.relayId ?? 'turn-relay'
  const edges = new Set<string>()
  const connect = (a: string, b: string) => {
    if (a === b) return
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    edges.add(key)
  }
  for (const member of input.memberDeviceIds) {
    connect(member, relay)
  }
  return edges
}

export type WanMeshScenario = {
  memberCount: number
  topology: GroupChatMeshTopology | 'wan_turn_assumed'
  ownerPeerConnected: boolean
}
