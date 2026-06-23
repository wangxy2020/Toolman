import { describe, expect, it } from 'vitest'
import {
  orderMeshCatchUpPeers,
  resolveReplicationTopology,
  resolveSeqSlotConflict,
} from './mesh-replication'

describe('mesh-replication', () => {
  it('resolves replication topology from owner and mesh connectivity', () => {
    expect(resolveReplicationTopology({ ownerOnline: true, meshPeersConnected: 2 })).toBe(
      'owner_star',
    )
    expect(resolveReplicationTopology({ ownerOnline: false, meshPeersConnected: 2 })).toBe(
      'member_mesh',
    )
    expect(resolveReplicationTopology({ ownerOnline: false, meshPeersConnected: 0 })).toBe(
      'offline',
    )
  })

  it('orders mesh peers by estimated lead over local seq', () => {
    const order = orderMeshCatchUpPeers(10, [
      {
        deviceId: 'peer-a',
        connected: true,
        lastReceivedSeq: 8,
        lastSentSeq: 9,
      },
      {
        deviceId: 'peer-b',
        connected: true,
        lastReceivedSeq: 15,
        lastSentSeq: 14,
      },
      {
        deviceId: 'peer-c',
        connected: false,
        lastReceivedSeq: 99,
        lastSentSeq: 99,
      },
    ])

    expect(order).toEqual(['peer-b', 'peer-a'])
  })

  it('prefers owner events when owner is authoritative', () => {
    const resolution = resolveSeqSlotConflict({
      ownerDeviceId: 'owner-device',
      localDeviceId: 'member-device',
      existingSourceDeviceId: 'member-device',
      incomingSourceDeviceId: 'owner-device',
      existingPayload: { _lamport: 100 },
      incomingPayload: { _lamport: 50 },
      existingSynced: true,
    })

    expect(resolution).toBe('replace')
  })

  it('resolves lamport ties in degraded mesh mode', () => {
    const resolution = resolveSeqSlotConflict({
      ownerDeviceId: 'owner-device',
      localDeviceId: 'member-b',
      existingSourceDeviceId: 'member-a',
      incomingSourceDeviceId: 'member-c',
      existingPayload: { _lamport: 200 },
      incomingPayload: { _lamport: 250 },
      existingSynced: true,
    })

    expect(resolution).toBe('replace')
  })

  it('breaks equal lamport by source device id', () => {
    const resolution = resolveSeqSlotConflict({
      ownerDeviceId: 'owner-device',
      localDeviceId: 'member-b',
      existingSourceDeviceId: 'member-a',
      incomingSourceDeviceId: 'member-z',
      existingPayload: { _lamport: 300 },
      incomingPayload: { _lamport: 300 },
      existingSynced: true,
    })

    expect(resolution).toBe('replace')
  })
})
