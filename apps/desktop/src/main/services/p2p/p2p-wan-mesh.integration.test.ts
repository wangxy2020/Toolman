import { describe, expect, it } from 'vitest'
import {
  buildTopologyConnections,
  memberDeviceIdsForCount,
  simulateGroupChatMeshDelivery,
} from './p2p-group-chat-mesh-simulation'
import { buildWanNatStarPhysicalConnections, buildWanTurnAssumedConnections } from './p2p-wan-topology'

const owner = 'owner'

describe('p2p WAN mesh (10-member GA automation)', () => {
  it('10-member WAN full mesh delivers to all when TURN enables pairwise connectivity', () => {
    const members = memberDeviceIdsForCount(10, owner)
    const sender = members[4]
    const connections = buildWanTurnAssumedConnections({
      memberDeviceIds: members,
      ownerDeviceId: owner,
    })

    const result = simulateGroupChatMeshDelivery({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      senderDeviceId: sender,
      messageId: 'wan-msg-10',
      connections,
      ownerPeerConnected: false,
    })

    expect(result.undelivered).toEqual([])
    expect(result.deliveredTo).toHaveLength(9)
  })

  it('10-member WAN owner-star delivers when owner is online across NAT', () => {
    const members = memberDeviceIdsForCount(10, owner)
    const sender = members[9]
    const connections = buildTopologyConnections({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      topology: 'owner_star',
    })

    const result = simulateGroupChatMeshDelivery({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      senderDeviceId: sender,
      messageId: 'wan-star-10',
      connections,
      ownerPeerConnected: true,
    })

    expect(result.undelivered).toEqual([])
    expect(result.deliveredTo).toContain(owner)
  })

  it('NAT star without TURN relay leaves non-relay peers isolated', () => {
    const members = memberDeviceIdsForCount(10, owner)
    const connections = buildWanNatStarPhysicalConnections({ memberDeviceIds: members })

    const result = simulateGroupChatMeshDelivery({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      senderDeviceId: members[1],
      messageId: 'wan-nat-gap',
      connections,
      ownerPeerConnected: false,
    })

    expect(result.undelivered.length).toBeGreaterThan(0)
  })
})
