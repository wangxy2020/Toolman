import { describe, expect, it } from 'vitest'
import type { P2pMember } from '@toolman/shared'
import {
  canManageTargetMember,
  groupP2pMembersByPerson,
  selectCurrentMemberDevice,
  selfMemberIdsForChat,
} from './group-member-utils'

function member(partial: Partial<P2pMember> & Pick<P2pMember, 'id' | 'deviceId' | 'identityId'>): P2pMember {
  return {
    workspaceId: 'ws-1',
    displayName: '用户',
    role: 'member',
    status: 'active',
    online: false,
    ...partial,
  }
}

describe('groupP2pMembersByPerson', () => {
  it('groups two devices of the same identity as one person', () => {
    const people = groupP2pMembersByPerson([
      member({
        id: 'm-desk',
        identityId: 'id-a',
        deviceId: 'desk-a',
        displayName: '用户A',
        role: 'owner',
        online: true,
      }),
      member({
        id: 'm-phone',
        identityId: 'id-a',
        deviceId: 'phone-a',
        displayName: '用户A',
        role: 'owner',
        online: false,
        deviceKind: 'mobile',
      }),
    ])
    expect(people).toHaveLength(1)
    expect(people[0]?.devices).toHaveLength(2)
    expect(people[0]?.online).toBe(true)
    expect(selfMemberIdsForChat(people[0]!.devices, 'm-desk', 'id-a')).toEqual([
      'm-desk',
      'm-phone',
    ])
    expect(
      selectCurrentMemberDevice(people[0]!, { memberId: 'm-desk', deviceId: 'desk-a' }).deviceId,
    ).toBe('desk-a')
  })

  it('keeps two users as two people even when one is on preview', () => {
    const people = groupP2pMembersByPerson([
      member({
        id: 'm-a',
        identityId: 'id-a',
        deviceId: 'desk-a',
        displayName: '用户A',
        role: 'owner',
        online: true,
        deviceKind: 'desktop',
      }),
      member({
        id: 'm-b',
        identityId: 'id-b',
        deviceId: 'phone-b',
        displayName: '用户B',
        role: 'member',
        online: true,
        deviceKind: 'mobile',
      }),
    ])
    expect(people).toHaveLength(2)
    expect(people.map((person) => person.displayName)).toEqual(['用户A', '用户B'])
    const bothMarkedOwner = groupP2pMembersByPerson(
      [
        member({
          id: 'm-a',
          identityId: 'id-a',
          deviceId: 'desk-a',
          displayName: 'Alice',
          role: 'owner',
        }),
        member({
          id: 'm-b',
          identityId: 'id-b',
          deviceId: 'phone-b',
          displayName: 'Bob',
          role: 'owner',
        }),
      ],
      { identityId: 'id-a', deviceId: 'desk-a' },
    )
    expect(bothMarkedOwner.find((person) => person.identityId === 'id-a')?.role).toBe('owner')
    expect(bothMarkedOwner.find((person) => person.identityId === 'id-b')?.role).toBe('member')
  })

  it('does not let a person manage their other device', () => {
    const phone = member({
      id: 'm-phone',
      identityId: 'id-a',
      deviceId: 'phone-a',
      role: 'admin',
    })
    expect(
      canManageTargetMember('owner', phone, { memberId: 'm-desk', identityId: 'id-a' }),
    ).toBe(false)
  })
})
