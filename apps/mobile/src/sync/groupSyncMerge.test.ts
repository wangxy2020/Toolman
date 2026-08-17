import { describe, expect, it } from 'vitest'
import {
  mergeGroupMembersFromSyncChanges,
  mergeGroupsFromSyncChanges,
  patchGroupOwnerFromRoster,
  sameGroupMemberRoster,
} from './groupSyncMerge'

describe('mergeGroupsFromSyncChanges', () => {
  it('upserts desktop groups from changelog payload', () => {
    const merged = mergeGroupsFromSyncChanges([], [
      {
        entityKind: 'p2p_group',
        entityId: 'g1',
        op: 'upsert',
        updatedAt: 20,
        payload: {
          name: '默认群组',
          createdAt: 10,
          members: [
            {
              id: 'm1',
              displayName: '用户A',
              role: 'owner',
              deviceId: 'd1',
              status: 'active',
            },
          ],
        },
      },
      {
        entityKind: 'p2p_group',
        entityId: 'g2',
        op: 'upsert',
        updatedAt: 21,
        payload: { name: '项目组', createdAt: 11 },
      },
    ])
    expect(merged).toHaveLength(2)
    expect(merged.map((group) => group.name)).toEqual(['项目组', '默认群组'])
    expect(merged.every((group) => group.origin === 'desktop')).toBe(true)
    expect(merged[1]).not.toHaveProperty('notes')
    expect(merged[1]).not.toHaveProperty('knowledge')
  })

  it('does not copy personal note bodies from extra changelog fields', () => {
    const merged = mergeGroupsFromSyncChanges([], [
      {
        entityKind: 'p2p_group',
        entityId: 'g1',
        op: 'upsert',
        updatedAt: 1,
        payload: {
          name: '默认群组',
          createdAt: 1,
          notes: [{ id: 'private-note', body: 'should stay on Sync Hub' }],
        },
      },
    ])
    expect(merged).toEqual([
      expect.objectContaining({ id: 'g1', name: '默认群组', origin: 'desktop' }),
    ])
    expect(JSON.stringify(merged)).not.toContain('private-note')
  })

  it('keeps local-only groups and ignores stale deletes', () => {
    const merged = mergeGroupsFromSyncChanges(
      [
        {
          id: 'local-1',
          name: '手机群',
          createdAt: 1,
          updatedAt: 1,
          origin: 'local',
        },
        {
          id: 'g1',
          name: 'Keep',
          createdAt: 1,
          updatedAt: 50,
          origin: 'desktop',
        },
      ],
      [
        {
          entityKind: 'p2p_group',
          entityId: 'g1',
          op: 'delete',
          updatedAt: 10,
          payload: {},
        },
      ],
    )
    expect(merged.map((group) => group.id).sort()).toEqual(['g1', 'local-1'])
  })
})

describe('mergeGroupMembersFromSyncChanges', () => {
  it('replaces members for upserted desktop groups', () => {
    const merged = mergeGroupMembersFromSyncChanges(
      {
        g1: [
          {
            id: 'phone-b',
            displayName: '用户B',
            role: 'member',
            deviceId: 'phone-b',
            identityId: 'id-b',
            deviceKind: 'mobile',
            online: true,
            status: 'invited',
          },
        ],
      },
      [
        {
          entityKind: 'p2p_group',
          entityId: 'g1',
          op: 'upsert',
          updatedAt: 2,
          payload: {
            name: '默认群组',
            createdAt: 1,
            members: [
              {
                id: 'm1',
                displayName: '用户A',
                role: 'owner',
                deviceId: 'd1',
                identityId: 'id-a',
                deviceKind: 'desktop',
                status: 'active',
              },
            ],
          },
        },
      ],
    )
    expect(merged.g1).toEqual([
      {
        id: 'm1',
        displayName: '用户A',
        role: 'owner',
        deviceId: 'd1',
        identityId: 'id-a',
        deviceKind: 'desktop',
        online: false,
        status: 'active',
      },
      {
        id: 'phone-b',
        displayName: '用户B',
        role: 'member',
        deviceId: 'phone-b',
        identityId: 'id-b',
        deviceKind: 'mobile',
        online: true,
        status: 'invited',
      },
    ])
  })

  it('keeps live presence when the roster is refreshed', () => {
    const merged = mergeGroupMembersFromSyncChanges(
      {
        g1: [
          {
            id: 'm1',
            displayName: '用户A',
            role: 'owner',
            deviceId: 'd1',
            identityId: 'id-a',
            deviceKind: 'desktop',
            online: true,
            status: 'active',
          },
        ],
      },
      [
        {
          entityKind: 'p2p_group',
          entityId: 'g1',
          op: 'upsert',
          updatedAt: 3,
          payload: {
            name: '默认群组',
            createdAt: 1,
            members: [
              {
                id: 'm1',
                displayName: '用户A',
                role: 'owner',
                deviceId: 'd1',
                identityId: 'id-a',
                deviceKind: 'desktop',
                status: 'active',
              },
            ],
          },
        },
      ],
    )
    expect(merged.g1?.[0]?.online).toBe(true)
  })
})

describe('roster UI updates', () => {
  it('does not replace groups when owner fields are unchanged', () => {
    const groups = [
      {
        id: 'g1',
        name: '默认群组',
        createdAt: 1,
        updatedAt: 1,
        origin: 'desktop' as const,
        ownerIdentityId: 'id-a',
        ownerDeviceId: 'desk-a',
      },
    ]
    expect(
      patchGroupOwnerFromRoster(groups, 'g1', { identityId: 'id-a', deviceId: 'desk-a' }),
    ).toBe(groups)
    expect(patchGroupOwnerFromRoster(groups, 'g1', { deviceId: 'desk-b' })[0]?.ownerDeviceId).toBe(
      'desk-b',
    )
  })

  it('treats identical member snapshots as unchanged', () => {
    const members = [
      {
        id: 'm1',
        displayName: 'Alice',
        role: 'owner' as const,
        deviceId: 'desk-a',
        identityId: 'id-a',
        deviceKind: 'desktop' as const,
        online: true,
        status: 'active' as const,
      },
    ]
    expect(sameGroupMemberRoster(members, [{ ...members[0]! }])).toBe(true)
    expect(sameGroupMemberRoster(members, [{ ...members[0]!, online: false }])).toBe(false)
  })
})
