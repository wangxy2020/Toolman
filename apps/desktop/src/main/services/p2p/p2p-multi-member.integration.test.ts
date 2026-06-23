import { describe, expect, it } from 'vitest'
import { P2pMemberRepository, P2pWorkspaceRepository, hashWorkspaceKey } from '@toolman/db'
import { createP2pTestDb, insertTestIdentity } from './p2p-test-db'
import {
  buildTopologyConnections,
  memberDeviceIdsForCount,
  simulateGroupChatMeshDelivery,
} from './p2p-group-chat-mesh-simulation'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'
const OWNER_DEVICE_ID = 'device-owner-test'

describe('p2p multi-member workspace integration', () => {
  for (const memberCount of [3, 5, 10] as const) {
    it(`persists ${memberCount} active members in one workspace`, () => {
      const { db, cleanup } = createP2pTestDb()
      try {
        const workspaceRepo = new P2pWorkspaceRepository(db)
        const memberRepo = new P2pMemberRepository(db)

        const workspace = workspaceRepo.create({
          name: `${memberCount} 人测试群`,
          ownerDeviceId: OWNER_DEVICE_ID,
          ownerIdentityId: DEFAULT_IDENTITY_ID,
          workspaceKeyHash: hashWorkspaceKey(`multi-member-${memberCount}`),
        })

        memberRepo.create({
          workspaceId: workspace.id,
          identityId: DEFAULT_IDENTITY_ID,
          deviceId: OWNER_DEVICE_ID,
          displayName: '群主',
          role: 'owner',
          status: 'active',
          joinedAt: new Date(),
        })

        for (let i = 1; i < memberCount; i += 1) {
          const identityId = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
          insertTestIdentity(db, identityId, `成员 ${i}`)
          memberRepo.create({
            workspaceId: workspace.id,
            identityId,
            deviceId: `device-member-${i}`,
            displayName: `成员 ${i}`,
            role: 'member',
            status: 'active',
            joinedAt: new Date(),
          })
        }

        const active = memberRepo.listByWorkspace(workspace.id, 'active')
        expect(active).toHaveLength(memberCount)
      } finally {
        cleanup()
      }
    })
  }
})

describe('p2p group chat mesh simulation (3–10 members)', () => {
  const owner = 'owner'

  for (const memberCount of [3, 5, 10] as const) {
    it(`${memberCount} members full mesh delivers to all when owner offline`, () => {
      const members = memberDeviceIdsForCount(memberCount, owner)
      const sender = members[1]
      const connections = buildTopologyConnections({
        memberDeviceIds: members,
        ownerDeviceId: owner,
        topology: 'full_mesh',
      })

      const result = simulateGroupChatMeshDelivery({
        memberDeviceIds: members,
        ownerDeviceId: owner,
        senderDeviceId: sender,
        messageId: 'msg-1',
        connections,
        ownerPeerConnected: false,
      })

      expect(result.undelivered).toEqual([])
      expect(result.deliveredTo).toHaveLength(memberCount - 1)
    })

    it(`${memberCount} members owner-star delivers when owner online`, () => {
      const members = memberDeviceIdsForCount(memberCount, owner)
      const sender = members[members.length - 1]
      const connections = buildTopologyConnections({
        memberDeviceIds: members,
        ownerDeviceId: owner,
        topology: 'owner_star',
      })

      const result = simulateGroupChatMeshDelivery({
        memberDeviceIds: members,
        ownerDeviceId: owner,
        senderDeviceId: sender,
        messageId: 'msg-star',
        connections,
        ownerPeerConnected: true,
      })

      expect(result.undelivered).toEqual([])
      expect(result.deliveredTo).toContain(owner)
    })
  }

  it('3-member chain relays via intermediate when owner offline', () => {
    const members = memberDeviceIdsForCount(3, owner)
    const connections = buildTopologyConnections({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      topology: 'chain',
    })

    const result = simulateGroupChatMeshDelivery({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      senderDeviceId: members[0],
      messageId: 'msg-chain',
      connections,
      ownerPeerConnected: false,
    })

    expect(result.undelivered).toEqual([])
    expect(result.relayRounds).toBeGreaterThanOrEqual(1)
  })

  it('10-member chain from tail reaches head through gossip hops', () => {
    const members = memberDeviceIdsForCount(10, owner)
    const connections = buildTopologyConnections({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      topology: 'chain',
    })

    const sender = members[members.length - 1]
    const result = simulateGroupChatMeshDelivery({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      senderDeviceId: sender,
      messageId: 'msg-long-chain',
      connections,
      ownerPeerConnected: false,
    })

    expect(result.undelivered).toEqual([])
    expect(result.deliveredTo).toContain(members[0])
    expect(result.relayRounds).toBeGreaterThanOrEqual(8)
  })

  it('isolated member does not receive message (documented SLA gap)', () => {
    const members = memberDeviceIdsForCount(5, owner)
    const connections = buildTopologyConnections({
      memberDeviceIds: members.slice(0, 4),
      ownerDeviceId: owner,
      topology: 'full_mesh',
    })
    const isolated = members[4]

    const result = simulateGroupChatMeshDelivery({
      memberDeviceIds: members,
      ownerDeviceId: owner,
      senderDeviceId: members[1],
      messageId: 'msg-isolated',
      connections,
      ownerPeerConnected: false,
    })

    expect(result.undelivered).toEqual([isolated])
  })
})
