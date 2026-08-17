import { describe, expect, it } from 'vitest'
import { applyPendingInvite } from './applyInvite'
import { pendingInviteFromInput } from './inviteParse'

describe('applyPendingInvite', () => {
  const self = {
    identityId: 'id-b',
    deviceId: 'phone-b',
    displayName: '用户B',
  }

  it('creates a desktop-origin group and marks self invited', () => {
    const invite = pendingInviteFromInput('toolman://join?token=tok-1&wid=ws-a&name=项目组')
    expect(invite).not.toBeNull()
    const applied = applyPendingInvite({
      groups: [],
      membersByGroup: {},
      invitesByGroup: {},
      invite: invite!,
      self,
    })
    expect(applied.activeGroupId).toBe('ws-a')
    expect(applied.groups[0]).toMatchObject({
      id: 'ws-a',
      name: '项目组',
      origin: 'desktop',
    })
    expect(applied.membersByGroup['ws-a']).toEqual([
      expect.objectContaining({
        deviceId: 'phone-b',
        identityId: 'id-b',
        deviceKind: 'mobile',
        status: 'invited',
        role: 'member',
      }),
    ])
    expect(applied.invitesByGroup['ws-a']?.token).toBe('tok-1')
  })

  it('keeps an already-active self member and adds the owner stub', () => {
    const applied = applyPendingInvite({
      groups: [
        {
          id: 'ws-a',
          name: '旧名',
          createdAt: 1,
          updatedAt: 1,
          origin: 'desktop',
        },
      ],
      membersByGroup: {
        'ws-a': [
          {
            id: 'phone-b',
            displayName: '用户B',
            role: 'member',
            deviceId: 'phone-b',
            identityId: 'id-b',
            deviceKind: 'mobile',
            online: true,
            status: 'active',
          },
        ],
      },
      invitesByGroup: {},
      invite: {
        raw: 'toolman://join?token=tok-1&wid=ws-a&name=新名',
        token: 'tok-1',
        workspaceId: 'ws-a',
        workspaceName: '新名',
        ownerIdentityId: 'id-a',
        ownerDeviceId: 'desk-a',
        ownerDisplayName: '用户A',
        receivedAt: 2,
      },
      self,
    })
    expect(applied.groups[0]?.name).toBe('新名')
    expect(applied.membersByGroup['ws-a']?.map((member) => member.status)).toEqual([
      'active',
      'active',
    ])
    expect(applied.membersByGroup['ws-a']?.[0]).toMatchObject({
      deviceId: 'desk-a',
      identityId: 'id-a',
      role: 'owner',
    })
  })

  it('attaches this phone to an existing person instead of creating a new member', () => {
    const applied = applyPendingInvite({
      groups: [
        {
          id: 'ws-a',
          name: '项目组',
          createdAt: 1,
          updatedAt: 1,
          origin: 'desktop',
        },
      ],
      membersByGroup: {
        'ws-a': [
          {
            id: 'desk-b',
            displayName: '用户B',
            role: 'owner',
            deviceId: 'desk-b',
            identityId: 'id-b',
            deviceKind: 'desktop',
            online: true,
            status: 'active',
          },
        ],
      },
      invitesByGroup: {},
      invite: {
        raw: 'toolman://join?token=tok-1&wid=ws-a&name=项目组',
        token: 'tok-1',
        workspaceId: 'ws-a',
        workspaceName: '项目组',
        role: 'member',
        receivedAt: 2,
      },
      self,
    })
    const members = applied.membersByGroup['ws-a'] ?? []
    expect(members).toHaveLength(2)
    expect(members.find((member) => member.deviceId === 'phone-b')).toMatchObject({
      identityId: 'id-b',
      role: 'owner',
      status: 'active',
      deviceKind: 'mobile',
    })
  })

  it('keeps owner on a second device when invite owner id is still the guest UUID', () => {
    const applied = applyPendingInvite({
      groups: [
        {
          id: 'ws-a',
          name: '项目组',
          createdAt: 1,
          updatedAt: 1,
          origin: 'desktop',
        },
      ],
      membersByGroup: {
        'ws-a': [
          {
            id: 'desk-a',
            displayName: '用户A',
            role: 'owner',
            deviceId: 'desk-a',
            identityId: 'ag-wxymale',
            deviceKind: 'desktop',
            online: true,
            status: 'active',
          },
        ],
      },
      invitesByGroup: {},
      invite: {
        raw: 'toolman://join?token=tok-1&wid=ws-a&name=项目组',
        token: 'tok-1',
        workspaceId: 'ws-a',
        workspaceName: '项目组',
        role: 'member',
        ownerIdentityId: '00000000-0000-4000-8000-000000000001',
        ownerDeviceId: 'desk-a',
        receivedAt: 2,
      },
      self: {
        identityId: 'ag-wxymale',
        deviceId: 'phone-a',
        displayName: '用户A',
      },
    })
    expect(applied.membersByGroup['ws-a']?.find((member) => member.deviceId === 'phone-a')).toMatchObject({
      identityId: 'ag-wxymale',
      role: 'owner',
      status: 'active',
    })
  })

  it('rejects an expired invite before local apply', () => {
    expect(() =>
      applyPendingInvite({
        groups: [],
        membersByGroup: {},
        invitesByGroup: {},
        invite: {
          raw: 'toolman://join?token=tok-old&wid=ws-old',
          token: 'tok-old',
          workspaceId: 'ws-old',
          expiresAt: 1,
          receivedAt: 2,
        },
        self,
      }),
    ).toThrow('邀请码已过期')
  })
})
