import { describe, expect, it } from 'vitest'
import {
  groupVisibleMembersByPerson,
  isSelfGroupMember,
  memberDeviceLine,
  memberDevicePresenceLine,
} from './groupPagePanelUtils'

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
