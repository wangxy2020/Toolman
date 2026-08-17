import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  hashWorkspaceKey,
  P2pMemberRepository,
  P2pWorkspaceRepository,
} from '@toolman/db'
import { createP2pTestDb, insertTestIdentity } from './p2p-test-db'
import { ensureLinkedIdentityRowInDb } from './p2p-linked-identity.service'

describe('ensureLinkedIdentityRowInDb', () => {
  it('allows creating a joined workspace whose owner identity is remote', () => {
    const { db, cleanup } = createP2pTestDb()
    try {
      const joinerIdentityId = randomUUID()
      insertTestIdentity(db, joinerIdentityId, '用户 B')

      const ownerIdentityId = randomUUID()
      ensureLinkedIdentityRowInDb(db, ownerIdentityId, '用户 A')

      const workspaceRepo = new P2pWorkspaceRepository(db)
      const memberRepo = new P2pMemberRepository(db)

      const workspace = workspaceRepo.create({
        id: randomUUID(),
        name: '跨实例群组',
        ownerDeviceId: 'device-owner-a',
        ownerIdentityId,
        workspaceKeyHash: hashWorkspaceKey('join-test-key'),
      })

      expect(() =>
        memberRepo.create({
          workspaceId: workspace.id,
          identityId: ownerIdentityId,
          deviceId: 'device-owner-a',
          displayName: '用户 A',
          role: 'owner',
          status: 'active',
          joinedAt: new Date(),
        }),
      ).not.toThrow()

      expect(() =>
        memberRepo.create({
          workspaceId: workspace.id,
          identityId: joinerIdentityId,
          deviceId: 'device-joiner-b',
          displayName: '用户 B',
          role: 'member',
          status: 'active',
          joinedAt: new Date(),
        }),
      ).not.toThrow()
    } finally {
      cleanup()
    }
  })

  it('allows Authing person ids as linked identities for member rows', () => {
    const { db, cleanup } = createP2pTestDb()
    try {
      const ownerIdentityId = randomUUID()
      insertTestIdentity(db, ownerIdentityId, '用户 A')
      ensureLinkedIdentityRowInDb(db, 'ag-wxymale', '用户 A')

      const workspaceRepo = new P2pWorkspaceRepository(db)
      const memberRepo = new P2pMemberRepository(db)
      const workspace = workspaceRepo.create({
        id: randomUUID(),
        name: '多端群组',
        ownerDeviceId: 'device-desk',
        ownerIdentityId,
        workspaceKeyHash: hashWorkspaceKey('multi-device-key'),
      })
      const ownerMember = memberRepo.create({
        workspaceId: workspace.id,
        identityId: ownerIdentityId,
        deviceId: 'device-desk',
        displayName: '用户 A',
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      })

      expect(() =>
        memberRepo.update({
          id: ownerMember.id,
          identityId: 'ag-wxymale',
        }),
      ).not.toThrow()
      expect(memberRepo.findById(ownerMember.id)?.identityId).toBe('ag-wxymale')

      expect(() =>
        workspaceRepo.update({
          id: workspace.id,
          ownerIdentityId: 'ag-wxymale',
        }),
      ).not.toThrow()
      expect(workspaceRepo.findById(workspace.id)?.ownerIdentityId).toBe('ag-wxymale')
    } finally {
      cleanup()
    }
  })

  it('fails without a linked owner identity row', () => {
    const { db, cleanup } = createP2pTestDb()
    try {
      const workspaceRepo = new P2pWorkspaceRepository(db)
      const ownerIdentityId = randomUUID()

      expect(() =>
        workspaceRepo.create({
          name: '应失败',
          ownerDeviceId: 'device-owner-a',
          ownerIdentityId,
          workspaceKeyHash: hashWorkspaceKey('missing-owner-identity'),
        }),
      ).toThrow(/FOREIGN KEY constraint failed/i)
    } finally {
      cleanup()
    }
  })
})
