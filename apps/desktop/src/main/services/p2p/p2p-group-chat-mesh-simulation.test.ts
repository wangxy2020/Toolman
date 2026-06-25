import { describe, expect, it } from 'vitest'

import {
  buildTopologyConnections,
  isPairConnected,
  memberDeviceIdsForCount,
  simulateGroupChatMeshDelivery,
} from './p2p-group-chat-mesh-simulation'

describe('p2p-group-chat-mesh-simulation', () => {
  it('builds owner star topology', () => {
    const edges = buildTopologyConnections({
      memberDeviceIds: ['owner', 'm1', 'm2'],
      ownerDeviceId: 'owner',
      topology: 'owner_star',
    })
    expect(isPairConnected(edges, 'owner', 'm1')).toBe(true)
    expect(isPairConnected(edges, 'm1', 'm2')).toBe(false)
  })

  it('builds chain topology', () => {
    const edges = buildTopologyConnections({
      memberDeviceIds: ['owner', 'm1', 'm2'],
      ownerDeviceId: 'owner',
      topology: 'chain',
    })
    expect(isPairConnected(edges, 'owner', 'm1')).toBe(true)
    expect(isPairConnected(edges, 'm1', 'm2')).toBe(true)
    expect(isPairConnected(edges, 'owner', 'm2')).toBe(false)
  })

  it('simulates delivery over full mesh when owner online', () => {
    const members = memberDeviceIdsForCount(4)
    const connections = buildTopologyConnections({
      memberDeviceIds: members,
      ownerDeviceId: 'owner',
      topology: 'full_mesh',
    })
    const result = simulateGroupChatMeshDelivery({
      memberDeviceIds: members,
      ownerDeviceId: 'owner',
      senderDeviceId: 'owner',
      messageId: 'msg-1',
      connections,
      ownerPeerConnected: true,
    })
    expect(result.undelivered).toEqual([])
    expect(result.deliveredTo.length).toBe(members.length - 1)
  })

  it('returns undelivered when sender is disconnected', () => {
    const members = memberDeviceIdsForCount(3)
    const result = simulateGroupChatMeshDelivery({
      memberDeviceIds: members,
      ownerDeviceId: 'owner',
      senderDeviceId: 'member-01',
      messageId: 'msg-1',
      connections: new Set(),
      ownerPeerConnected: false,
    })
    expect(result.deliveredTo).toEqual([])
    expect(result.undelivered.length).toBe(2)
  })
})
