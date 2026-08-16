import { describe, expect, it } from 'vitest'
import {
  groupVisibleMembersByPerson,
  isSelfGroupMember,
  memberDeviceLine,
  memberOnlineLabel,
} from './groupPagePanelUtils'

describe('groupVisibleMembersByPerson', () => {
  it('groups two devices of the same identity as one person', () => {
    const people = groupVisibleMembersByPerson([
      {
        id: 'desk-a',
        displayName: '用户A',
        role: 'owner',
        deviceId: 'desk-a',
        identityId: 'id-a',
        deviceKind: 'desktop',
        online: true,
        status: 'active',
      },
      {
        id: 'phone-a',
        displayName: '用户A',
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
  it('shows only device kind and short id', () => {
    expect(memberDeviceLine('desktop', 'device-a', (id) => id)).toBe('电脑 device-a')
    expect(memberDeviceLine('mobile', 'device-b', (id) => id)).toBe('手机 device-b')
  })

  it('shows online or offline without a local-device prefix', () => {
    expect(memberOnlineLabel(true)).toBe('在线')
    expect(memberOnlineLabel(false)).toBe('离线')
  })
})
