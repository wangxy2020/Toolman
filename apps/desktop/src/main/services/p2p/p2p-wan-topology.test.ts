import { describe, expect, it } from 'vitest'

import {
  buildWanNatStarPhysicalConnections,
  buildWanTurnAssumedConnections,
} from './p2p-wan-topology'

describe('p2p-wan-topology', () => {
  it('builds full mesh connections for TURN-assumed WAN', () => {
    const edges = buildWanTurnAssumedConnections({
      memberDeviceIds: ['owner', 'member-a', 'member-b'],
      ownerDeviceId: 'owner',
    })
    expect(edges.has('member-a|member-b')).toBe(true)
    expect(edges.has('member-a|owner')).toBe(true)
  })

  it('builds NAT star edges through relay', () => {
    const edges = buildWanNatStarPhysicalConnections({
      memberDeviceIds: ['dev-a', 'dev-b'],
      relayId: 'turn-1',
    })
    expect(edges.has('dev-a|turn-1')).toBe(true)
    expect(edges.has('dev-b|turn-1')).toBe(true)
    expect(edges.has('dev-a|dev-b')).toBe(false)
  })
})
