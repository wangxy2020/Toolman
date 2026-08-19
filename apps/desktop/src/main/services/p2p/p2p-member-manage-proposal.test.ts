import { describe, expect, it, vi } from 'vitest'

const findByWorkspaceAndDevice = vi.hoisted(() => vi.fn())
const findById = vi.hoisted(() => vi.fn())

vi.mock('./p2p-member-shared', () => ({
  getMemberRepo: () => ({
    findByWorkspaceAndDevice,
    findById,
  }),
}))

import { authorizeMemberManagementProposal } from './p2p-member-manage-proposal'

describe('authorizeMemberManagementProposal', () => {
  it('allows an owner to remove another member', () => {
    findByWorkspaceAndDevice.mockReturnValue({
      id: 'owner-row',
      identityId: 'id-owner',
      deviceId: 'desk',
      role: 'owner',
      status: 'active',
    })
    findById.mockReturnValue({
      id: 'bob',
      workspaceId: 'ws-1',
      identityId: 'id-bob',
      deviceId: 'bob-phone',
      role: 'member',
      status: 'active',
    })
    expect(
      authorizeMemberManagementProposal({
        workspaceId: 'ws-1',
        senderDeviceId: 'desk',
        resourceId: 'bob',
        eventType: 'Left',
        payload: { member_id: 'bob', reason: 'removed' },
      }),
    ).toEqual({ ok: true })
  })

  it('rejects a regular member kicking someone', () => {
    findByWorkspaceAndDevice.mockReturnValue({
      id: 'alice',
      identityId: 'id-alice',
      deviceId: 'alice-phone',
      role: 'member',
      status: 'active',
    })
    findById.mockReturnValue({
      id: 'bob',
      workspaceId: 'ws-1',
      identityId: 'id-bob',
      deviceId: 'bob-phone',
      role: 'member',
      status: 'active',
    })
    expect(
      authorizeMemberManagementProposal({
        workspaceId: 'ws-1',
        senderDeviceId: 'alice-phone',
        resourceId: 'bob',
        eventType: 'Left',
        payload: { member_id: 'bob', reason: 'removed' },
      }),
    ).toEqual({ ok: false, reason: '无权管理该成员' })
  })
})
