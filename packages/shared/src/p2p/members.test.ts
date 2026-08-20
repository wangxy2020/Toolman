import { describe, expect, it } from 'vitest'
import {
  collectPersonMemberIds,
  countDistinctMemberIdentities,
  findSelfWorkspaceMember,
  groupMembersByIdentity,
  groupVisibleMembersByPerson,
  identityAlreadyPresent,
  identityIdForSiblingLookup,
  inferMemberDeviceKind,
  isMailboxFirstP2pClient,
  resolveMailboxSessionAdmission,
  mailboxSessionAuthDenied,
  shouldAcceptUnsignedMailboxFirstGroupChat,
  isOwnGroupChatSender,
  isPlaceholderMemberName,
  isSamePerson,
  preferMemberDisplayName,
  preferUsableMemberIdentityId,
  isMemberRecentlySeen,
  resolveJoinedDeviceRole,
  resolveLivePeerMemberDisplayName,
  resolvePeerMemberDisplayName,
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

  it('labels own group-chat messages by member, device, or identity — not display name', () => {
    const members = [
      {
        id: 'm-desk',
        identityId: 'ag-wxymale',
        deviceId: 'desk-a',
        displayName: 'wxymale',
      },
      {
        id: 'm-phone',
        identityId: 'ag-wxymale',
        deviceId: 'phone-a',
        displayName: 'wxymale',
      },
      {
        id: 'm-jack',
        identityId: 'ag-jack',
        deviceId: 'desk-b',
        displayName: 'wxymale',
      },
    ]
    const self = { memberId: 'm-desk', identityId: 'ag-wxymale', deviceId: 'desk-a' }
    expect(isOwnGroupChatSender('m-desk', members, self)).toBe(true)
    expect(isOwnGroupChatSender('m-phone', members, self)).toBe(true)
    expect(isOwnGroupChatSender('desk-a', members, self)).toBe(true)
    expect(isOwnGroupChatSender('ag-wxymale', members, self)).toBe(true)
    expect(isOwnGroupChatSender('m-jack', members, self)).toBe(false)
    expect(
      isOwnGroupChatSender('m-desk', members, {
        memberId: null,
        identityId: null,
        deviceId: null,
      }),
    ).toBe(false)
    expect(
      isOwnGroupChatSender('m-desk', [], {
        memberId: 'm-desk',
        identityId: null,
        deviceId: null,
      }),
    ).toBe(true)
    const unknown = '00000000-0000-0000-0000-000000000001'
    expect(
      isOwnGroupChatSender('m-jack', [
        { id: 'm-desk', identityId: unknown, deviceId: 'desk-a', displayName: 'wxymale' },
        { id: 'm-jack', identityId: unknown, deviceId: 'phone-b', displayName: 'Jack' },
      ], { memberId: 'm-desk', identityId: unknown, deviceId: 'desk-a' }),
    ).toBe(false)
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
    expect(people.find((person) => person.identityId === 'b')?.displayName).toBe('成员')
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
    expect(identityIdForSiblingLookup('00000000-0000-0000-0000-000000000001')).toBeNull()
    expect(identityIdForSiblingLookup('ag-wxymale')).toBe('ag-wxymale')
    expect(preferUsableMemberIdentityId('00000000-0000-0000-0000-000000000001', 'ag-wxymale')).toBe(
      'ag-wxymale',
    )
    expect(inferMemberDeviceKind('mobile-msdms50h-r336hh2e')).toBe('mobile')
    expect(inferMemberDeviceKind('web-abc')).toBe('web')
    expect(inferMemberDeviceKind('016c72ca-8be2-4fcc-aa5e-9d1e41919fb4')).toBe('desktop')
    expect(inferMemberDeviceKind('abc', 'web')).toBe('web')
    expect(inferMemberDeviceKind('abc', 'mobile')).toBe('mobile')
    expect(isMailboxFirstP2pClient('mobile-msdms50h-r336hh2e')).toBe(true)
    expect(isMailboxFirstP2pClient('web-abc')).toBe(true)
    expect(isMailboxFirstP2pClient('016c72ca-8be2-4fcc-aa5e-9d1e41919fb4')).toBe(false)
    expect(resolveMailboxSessionAdmission({ existingStatus: 'active', hasActiveSibling: false })).toBe(
      'ok',
    )
    expect(resolveMailboxSessionAdmission({ hasActiveSibling: true })).toBe('create')
    expect(
      resolveMailboxSessionAdmission({ existingStatus: 'removed', hasActiveSibling: true }),
    ).toBe('reactivate')
    expect(
      resolveMailboxSessionAdmission({ existingStatus: 'removed', hasActiveSibling: false }),
    ).toBe('forbidden')
    expect(resolveMailboxSessionAdmission({ existingStatus: 'left', hasActiveSibling: false })).toBe(
      'forbidden',
    )
    expect(
      mailboxSessionAuthDenied({
        admission: 'create',
        hubAuthenticated: false,
        inviteOk: true,
      }),
    ).toBe('unauthorized')
    expect(
      mailboxSessionAuthDenied({
        admission: 'ok',
        hubAuthenticated: false,
        inviteOk: true,
      }),
    ).toBeNull()
    expect(
      mailboxSessionAuthDenied({
        admission: 'ok',
        hubAuthenticated: false,
        inviteOk: false,
      }),
    ).toBe('unauthorized')
    expect(
      mailboxSessionAuthDenied({
        admission: 'create',
        hubAuthenticated: true,
        inviteOk: false,
      }),
    ).toBeNull()
    expect(
      shouldAcceptUnsignedMailboxFirstGroupChat({
        peerDeviceId: 'web-abc',
        workspaceId: 'ws-a',
        peerConnected: true,
      }),
    ).toBe(true)
    expect(
      shouldAcceptUnsignedMailboxFirstGroupChat({
        peerDeviceId: 'mobile-msdms50h-r336hh2e',
        workspaceId: 'ws-a',
        peerConnected: true,
      }),
    ).toBe(true)
    expect(
      shouldAcceptUnsignedMailboxFirstGroupChat({
        peerDeviceId: '016c72ca-8be2-4fcc-aa5e-9d1e41919fb4',
        workspaceId: 'ws-a',
        peerConnected: true,
      }),
    ).toBe(false)
    expect(
      shouldAcceptUnsignedMailboxFirstGroupChat({
        peerDeviceId: 'web-abc',
        workspaceId: 'ws-a',
        peerConnected: false,
      }),
    ).toBe(false)
    expect(isMemberRecentlySeen(Date.now() - 10_000)).toBe(true)
    expect(isMemberRecentlySeen(Date.now() - 60_000)).toBe(false)
    expect(isMemberRecentlySeen(null)).toBe(false)
  })

  it('picks a real 显示名称 over placeholders for the person and live chat label', () => {
    expect(isPlaceholderMemberName('群主')).toBe(true)
    expect(isPlaceholderMemberName('本地用户')).toBe(true)
    expect(isPlaceholderMemberName('我')).toBe(true)
    expect(isPlaceholderMemberName('ag-wxymale')).toBe(true)
    expect(isPlaceholderMemberName('fb-abc123')).toBe(true)
    expect(preferMemberDisplayName('群主', 'wxymale', '本地用户')).toBe('wxymale')
    expect(resolvePeerMemberDisplayName('群主', '本地用户')).toBe('成员')
    expect(resolvePeerMemberDisplayName()).toBe('成员')
    const members = [
      { id: 'm-desk', identityId: 'id-a', deviceId: 'desk-a', displayName: 'wxymale' },
      { id: 'm-phone', identityId: 'id-a', deviceId: 'phone-a', displayName: '群主' },
    ]
    expect(resolveLivePeerMemberDisplayName(members, 'm-phone', '我')).toBe('wxymale')
    expect(groupVisibleMembersByPerson(members)[0]?.displayName).toBe('wxymale')
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
    expect(
      resolveJoinedDeviceRole({
        inheritedRole: 'owner',
        requestedRole: 'member',
        joinerIdentityId: 'ag-wxymale',
        ownerIdentityId: '00000000-0000-4000-8000-000000000001',
        ownerDeviceId: 'desk-a',
        sibling: { role: 'owner', deviceId: 'desk-a', identityId: '00000000-0000-4000-8000-000000000001' },
      }),
    ).toBe('owner')
    expect(
      resolveJoinedDeviceRole({
        inheritedRole: 'owner',
        requestedRole: 'owner',
        joinerIdentityId: 'ag-other',
        ownerIdentityId: 'ag-wxymale',
      }),
    ).toBe('member')
    expect(
      findSelfWorkspaceMember(
        [
          { identityId: 'ag-wxymale', deviceId: 'phone-a', status: 'active' },
          { identityId: 'ag-wxymale', deviceId: 'desk-a', status: 'active' },
        ],
        { deviceId: 'desk-a', identityId: 'ag-wxymale' },
      )?.deviceId,
    ).toBe('desk-a')
  })
})
