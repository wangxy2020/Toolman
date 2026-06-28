import { describe, expect, it, vi } from 'vitest'

import { P2pEventRepository, P2pMemberRepository } from '@toolman/db'

import {
  resolveLocalSharedByMemberId,
  resolveSharedByMember,
} from './p2p-shared-by-member.service'

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({}),
}))

describe('p2p-shared-by-member.service', () => {
  it('maps remote operator id to local member id by source device', () => {
    vi.spyOn(P2pMemberRepository.prototype, 'findById').mockReturnValue(null)
    vi.spyOn(P2pMemberRepository.prototype, 'findByWorkspaceAndDevice').mockReturnValue({
      id: 'local-owner-id',
      workspaceId: 'ws-1',
      identityId: 'identity-owner',
      deviceId: 'device-owner',
      displayName: '用户A',
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
      certJson: null,
      invitedBy: null,
      lastSeenAt: null,
    })

    expect(
      resolveLocalSharedByMemberId('ws-1', 'remote-owner-id', 'device-owner'),
    ).toBe('local-owner-id')
  })

  it('resolves display name from event source device when sharedBy id is remote', () => {
    vi.spyOn(P2pMemberRepository.prototype, 'findById').mockReturnValue(null)
    vi.spyOn(P2pMemberRepository.prototype, 'findByWorkspaceAndDevice').mockReturnValue({
      id: 'local-owner-id',
      workspaceId: 'ws-1',
      identityId: 'identity-owner',
      deviceId: 'device-owner',
      displayName: '用户A',
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
      certJson: null,
      invitedBy: null,
      lastSeenAt: null,
    })
    vi.spyOn(P2pEventRepository.prototype, 'findLatestByOperatorId').mockReturnValue({
      id: 'event-1',
      workspaceId: 'ws-1',
      seq: 3,
      resourceType: 'Knowledge',
      resourceId: 'kb-1',
      operatorId: 'remote-owner-id',
      eventType: 'Shared',
      payloadJson: '{}',
      payloadHash: 'hash',
      prevEventHash: null,
      timestamp: new Date(),
      sourceDeviceId: 'device-owner',
      synced: true,
      createdAt: new Date(),
    })

    expect(resolveSharedByMember('ws-1', 'remote-owner-id')).toEqual({
      id: 'local-owner-id',
      displayName: '用户A',
    })
  })
})
