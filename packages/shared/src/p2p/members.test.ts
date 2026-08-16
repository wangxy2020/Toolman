import { describe, expect, it } from 'vitest'
import {
  collectPersonMemberIds,
  countDistinctMemberIdentities,
  groupMembersByIdentity,
  groupVisibleMembersByPerson,
  identityAlreadyPresent,
  isSamePerson,
  resolvePersonDeviceMembership,
} from './members.js'

describe('groupMembersByIdentity', () => {
  it('groups devices of the same person', () => {
    const grouped = groupMembersByIdentity([
      { identityId: 'a', deviceId: 'desk-a', status: 'active' },
      { identityId: 'a', deviceId: 'phone-a', status: 'invited' },
      { deviceId: 'solo', status: 'active' },
    ])
    expect(grouped).toHaveLength(2)
    expect(grouped[0]?.devices).toHaveLength(2)
    expect(grouped[1]?.identityId).toBe('solo')
  })

  it('counts unique identities and detects an existing person', () => {
    const members = [
      { identityId: 'a', deviceId: 'd1', status: 'active' },
      { identityId: 'a', deviceId: 'd2', status: 'active' },
      { identityId: 'b', deviceId: 'd3', status: 'invited' },
    ]
    expect(countDistinctMemberIdentities(members, 'active')).toBe(1)
    expect(identityAlreadyPresent(members, 'a', 'active')).toBe(true)
    expect(identityAlreadyPresent(members, 'b', 'active')).toBe(false)
  })

  it('summarizes one person across devices and matches self by identity', () => {
    const people = groupVisibleMembersByPerson([
      {
        id: 'm-desk',
        identityId: 'a',
        deviceId: 'desk-a',
        displayName: '用户A',
        role: 'owner',
        status: 'active',
        online: true,
      },
      {
        id: 'm-phone',
        identityId: 'a',
        deviceId: 'phone-a',
        displayName: '用户A',
        role: 'member',
        status: 'invited',
        online: false,
      },
    ])
    expect(people).toHaveLength(1)
    expect(people[0]?.role).toBe('owner')
    expect(people[0]?.online).toBe(true)
    expect(people[0]?.status).toBe('active')
    expect(isSamePerson(people[0]!.devices[1]!, { identityId: 'a', deviceId: 'other' })).toBe(true)
    expect(collectPersonMemberIds(people[0]!.devices, { identityId: 'a' })).toEqual([
      'm-desk',
      'm-phone',
    ])
  })

  it('assigns owner only to the workspace owner person', () => {
    const people = groupVisibleMembersByPerson(
      [
        {
          identityId: 'a',
          deviceId: 'desk-a',
          displayName: 'Alice',
          role: 'owner',
          status: 'active',
        },
        {
          identityId: 'b',
          deviceId: 'phone-b',
          displayName: 'P2P用户B',
          role: 'owner',
          status: 'active',
        },
      ],
      { identityId: 'a', deviceId: 'desk-a' },
    )
    expect(people.find((person) => person.identityId === 'a')?.role).toBe('owner')
    expect(people.find((person) => person.identityId === 'b')?.role).toBe('member')
    expect(people.find((person) => person.identityId === 'b')?.displayName).toBe('P2P用户B')
  })

  it('does not treat the unknown identity placeholder as the same person', () => {
    const grouped = groupMembersByIdentity([
      { identityId: '00000000-0000-0000-0000-000000000001', deviceId: 'desk-a' },
      { identityId: '00000000-0000-0000-0000-000000000001', deviceId: 'phone-b' },
    ])
    expect(grouped).toHaveLength(2)
    expect(
      isSamePerson(
        { identityId: '00000000-0000-0000-0000-000000000001', deviceId: 'phone-b' },
        { identityId: '00000000-0000-0000-0000-000000000001', deviceId: 'desk-a' },
      ),
    ).toBe(false)
  })

  it('attaches a second device to the existing person instead of using the invite role', () => {
    expect(
      resolvePersonDeviceMembership({
        inviteRole: 'member',
        sibling: { role: 'owner', status: 'active' },
      }),
    ).toEqual({ role: 'owner', status: 'active' })
    expect(resolvePersonDeviceMembership({ inviteRole: 'admin' })).toEqual({
      role: 'admin',
      status: 'invited',
    })
  })
})
