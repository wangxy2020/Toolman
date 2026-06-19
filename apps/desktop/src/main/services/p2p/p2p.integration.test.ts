import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  hashEventPayload,
  hashWorkspaceKey,
  P2pEventRepository,
  P2pMemberRepository,
  P2pWorkspaceRepository,
} from '@toolman/db'
import { createP2pTestDb, insertTestIdentity } from './p2p-test-db'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'
const OWNER_DEVICE_ID = 'device-owner-test'
const MEMBER_DEVICE_ID = 'device-member-test'

function computeEventHash(input: {
  eventId: string
  workspaceId: string
  seq: number
  resourceType: string
  resourceId: string
  operatorId: string
  eventType: string
  payloadHash: string
  prevEventHash: string | null
  timestamp: number
  sourceDeviceId: string
}): string {
  const prev = input.prevEventHash ?? ''
  const material = [
    input.eventId,
    input.workspaceId,
    input.seq,
    input.resourceType,
    input.resourceId,
    input.operatorId,
    input.eventType,
    input.payloadHash,
    prev,
    input.timestamp,
    input.sourceDeviceId,
  ].join('|')

  return createHash('sha256').update(material).digest('hex')
}

describe('p2p workspace integration', () => {
  it('supports workspace CRUD lifecycle', () => {
    const { db, cleanup } = createP2pTestDb()
    try {
      const workspaceRepo = new P2pWorkspaceRepository(db)
      const memberRepo = new P2pMemberRepository(db)

      const workspace = workspaceRepo.create({
        name: '集成测试群',
        description: 'Task-026',
        ownerDeviceId: OWNER_DEVICE_ID,
        ownerIdentityId: DEFAULT_IDENTITY_ID,
        workspaceKeyHash: hashWorkspaceKey('integration-workspace-key'),
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

      const updated = workspaceRepo.update({
        id: workspace.id,
        name: '重命名后的群',
        description: '已更新',
      })
      expect(updated?.name).toBe('重命名后的群')

      const listed = workspaceRepo.listByOwnerIdentity(DEFAULT_IDENTITY_ID)
      expect(listed.some((item) => item.id === workspace.id)).toBe(true)

      const memberIdentityId = randomUUID()
      insertTestIdentity(db, memberIdentityId, '成员 B')

      const member = memberRepo.create({
        workspaceId: workspace.id,
        identityId: memberIdentityId,
        deviceId: MEMBER_DEVICE_ID,
        displayName: '成员 B',
        role: 'member',
        status: 'active',
        joinedAt: new Date(),
      })

      memberRepo.update({ id: member.id, status: 'left' })
      const activeMembers = memberRepo.listByWorkspace(workspace.id, 'active')
      expect(activeMembers).toHaveLength(1)

      expect(workspaceRepo.softDelete(workspace.id)).toBe(true)
      expect(workspaceRepo.findById(workspace.id)).toBeNull()
      expect(workspaceRepo.listByOwnerIdentity(DEFAULT_IDENTITY_ID)).toHaveLength(0)
    } finally {
      cleanup()
    }
  })
})

describe('p2p event round-trip integration', () => {
  it('appends events with monotonic seq and hash chain', () => {
    const { db, cleanup } = createP2pTestDb()
    try {
      const workspaceRepo = new P2pWorkspaceRepository(db)
      const memberRepo = new P2pMemberRepository(db)
      const eventRepo = new P2pEventRepository(db)

      const workspace = workspaceRepo.create({
        name: '事件测试群',
        ownerDeviceId: OWNER_DEVICE_ID,
        ownerIdentityId: DEFAULT_IDENTITY_ID,
        workspaceKeyHash: hashWorkspaceKey('event-roundtrip-key'),
      })

      const owner = memberRepo.create({
        workspaceId: workspace.id,
        identityId: DEFAULT_IDENTITY_ID,
        deviceId: OWNER_DEVICE_ID,
        displayName: '群主',
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      })

      const first = eventRepo.append({
        workspaceId: workspace.id,
        resourceType: 'Workspace',
        resourceId: workspace.id,
        operatorId: owner.id,
        eventType: 'Created',
        payload: { name: workspace.name },
        sourceDeviceId: OWNER_DEVICE_ID,
        timestamp: new Date(1_700_000_000_000),
      })

      const second = eventRepo.append({
        workspaceId: workspace.id,
        resourceType: 'Member',
        resourceId: owner.id,
        operatorId: owner.id,
        eventType: 'Joined',
        payload: { displayName: '群主' },
        sourceDeviceId: OWNER_DEVICE_ID,
        timestamp: new Date(1_700_000_000_100),
        prevEventHash: computeEventHash({
          eventId: first.id,
          workspaceId: first.workspaceId,
          seq: first.seq,
          resourceType: first.resourceType,
          resourceId: first.resourceId,
          operatorId: first.operatorId,
          eventType: first.eventType,
          payloadHash: first.payloadHash,
          prevEventHash: first.prevEventHash,
          timestamp: first.timestamp.getTime(),
          sourceDeviceId: first.sourceDeviceId,
        }),
      })

      expect(first.seq).toBe(1)
      expect(second.seq).toBe(2)
      expect(second.prevEventHash).toBeTruthy()

      const sinceFirst = eventRepo.list({ workspaceId: workspace.id, sinceSeq: 1 })
      expect(sinceFirst).toHaveLength(1)
      expect(sinceFirst[0]?.id).toBe(second.id)

      const reloaded = workspaceRepo.findById(workspace.id)
      expect(reloaded?.lastEventSeq).toBe(2)
    } finally {
      cleanup()
    }
  })

  it('replicates remote events by seq without duplicating slots', () => {
    const { db, cleanup } = createP2pTestDb()
    try {
      const workspaceRepo = new P2pWorkspaceRepository(db)
      const memberRepo = new P2pMemberRepository(db)
      const eventRepo = new P2pEventRepository(db)

      const workspace = workspaceRepo.create({
        name: '复制测试群',
        ownerDeviceId: OWNER_DEVICE_ID,
        ownerIdentityId: DEFAULT_IDENTITY_ID,
        workspaceKeyHash: hashWorkspaceKey('replication-key'),
      })

      const owner = memberRepo.create({
        workspaceId: workspace.id,
        identityId: DEFAULT_IDENTITY_ID,
        deviceId: OWNER_DEVICE_ID,
        displayName: '群主',
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      })

      const local = eventRepo.append({
        workspaceId: workspace.id,
        resourceType: 'Workspace',
        resourceId: workspace.id,
        operatorId: owner.id,
        eventType: 'Created',
        payload: { name: workspace.name },
        sourceDeviceId: OWNER_DEVICE_ID,
      })

      const remoteEventId = randomUUID()
      const remotePayload = { displayName: '远端成员' }
      const remotePayloadJson = JSON.stringify(remotePayload)
      const remotePayloadHash = hashEventPayload(remotePayloadJson)
      const remoteTimestamp = 1_700_000_001_000

      eventRepo.insert({
        id: remoteEventId,
        workspaceId: workspace.id,
        seq: 2,
        resourceType: 'Member',
        resourceId: randomUUID(),
        operatorId: owner.id,
        eventType: 'Joined',
        payload: remotePayload,
        prevEventHash: computeEventHash({
          eventId: local.id,
          workspaceId: local.workspaceId,
          seq: local.seq,
          resourceType: local.resourceType,
          resourceId: local.resourceId,
          operatorId: local.operatorId,
          eventType: local.eventType,
          payloadHash: local.payloadHash,
          prevEventHash: local.prevEventHash,
          timestamp: local.timestamp.getTime(),
          sourceDeviceId: local.sourceDeviceId,
        }),
        sourceDeviceId: MEMBER_DEVICE_ID,
        timestamp: new Date(remoteTimestamp),
        synced: true,
      })

      const conflict = eventRepo.findByWorkspaceSeq(workspace.id, 2)
      expect(conflict?.id).toBe(remoteEventId)

      const all = eventRepo.list({ workspaceId: workspace.id })
      expect(all).toHaveLength(2)
      expect(all[1]?.payloadJson).toBe(remotePayloadJson)
      expect(all[1]?.payloadHash).toBe(remotePayloadHash)
    } finally {
      cleanup()
    }
  })
})
