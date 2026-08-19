import { describe, expect, it } from 'vitest'
import {
  canManageTargetPerson,
  groupVisibleMembersByPerson,
  isSelfGroupMember,
  memberDeviceLine,
  memberDevicePresenceLine,
  resolveSelfMemberRole,
} from './groupPagePanelUtils'
import type { GroupMember } from '../storage/groupChat'

function member(partial: Partial<GroupMember> & Pick<GroupMember, 'id' | 'deviceId'>): GroupMember {
  return {
    displayName: '用户',
    role: 'member',
    online: false,
    status: 'active',
    ...partial,
  }
}

describe('groupVisibleMembersByPerson', () => {
  it('groups two devices of the same identity as one person', () => {
    const people = groupVisibleMembersByPerson([
      {
        id: 'desk-a',
        displayName: 'Alice',
        role: 'owner',
        deviceId: 'desk-a',
        identityId: 'id-a',
        deviceKind: 'desktop',
        online: true,
        status: 'active',
      },
      {
        id: 'phone-a',
        displayName: 'Alice',
        role: 'owner',
        deviceId: 'phone-a',
        identityId: 'id-a',
        deviceKind: 'mobile',
        online: false,
        status: 'invited',
      },
    ])
    expect(people).toHaveLength(1)
    expect(people[0]?.devices).toHaveLength(2)
    expect(people[0]?.status).toBe('active')
    expect(
      isSelfGroupMember(people[0]!.devices[1]!, { identityId: 'id-a', deviceId: 'phone-a' }),
    ).toBe(true)
  })
})

describe('owner member management', () => {
  it('treats the logged-in owner identity as owner even on another device', () => {
    expect(
      resolveSelfMemberRole(
        [
          member({ id: 'desk', deviceId: 'desk', identityId: 'id-owner', role: 'owner' }),
          member({ id: 'phone', deviceId: 'phone', identityId: 'id-owner', role: 'member' }),
        ],
        { identityId: 'id-owner', deviceId: 'phone' },
        { identityId: 'id-owner', deviceId: 'desk' },
      ),
    ).toBe('owner')
  })

  it('lets the owner manage another person but not themselves', () => {
    const people = groupVisibleMembersByPerson([
      member({
        id: 'owner',
        deviceId: 'desk',
        identityId: 'id-owner',
        role: 'owner',
        displayName: '群主',
      }),
      member({
        id: 'bob',
        deviceId: 'bob-phone',
        identityId: 'id-bob',
        role: 'member',
        displayName: 'Bob',
      }),
    ])
    const self = { identityId: 'id-owner', deviceId: 'desk' }
    expect(canManageTargetPerson('owner', people[0]!, self)).toBe(false)
    expect(canManageTargetPerson('owner', people[1]!, self)).toBe(true)
    expect(canManageTargetPerson('member', people[1]!, self)).toBe(false)
  })
})

describe('member card labels', () => {
  it('shows only device kind', () => {
    expect(memberDeviceLine('desktop')).toBe('桌面')
    expect(memberDeviceLine('mobile')).toBe('移动')
    expect(memberDeviceLine('web')).toBe('网页')
  })

  it('puts online status next to the device kind', () => {
    expect(memberDevicePresenceLine('desktop', true)).toBe('桌面 · 在线')
    expect(memberDevicePresenceLine('web', false)).toBe('网页 · 离线')
    expect(memberDevicePresenceLine('mobile', false, 'invited')).toBe('移动 · 待加入')
  })
})
