import { describe, expect, it } from 'vitest'

import type { P2pMember, P2pSharedResource } from '@toolman/shared'

import { groupResourcesByMember } from './group-shared-resources-by-member'

function member(id: string, displayName: string): P2pMember {
  return {
    id,
    workspaceId: 'ws-1',
    identityId: `identity-${id}`,
    deviceId: `device-${id}`,
    displayName,
    role: 'member',
    status: 'active',
    online: false,
    joinedAt: Date.now(),
  }
}

function resource(id: string, sharedBy: string): P2pSharedResource {
  return {
    id,
    workspaceId: 'ws-1',
    resourceType: 'Agent',
    localResourceId: id,
    name: `Resource ${id}`,
    sharedBy,
    permission: 'read',
    status: 'active',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('groupResourcesByMember', () => {
  it('groups resources by sharedBy and puts self first', () => {
    const members = [member('m-a', '用户A'), member('m-b', '用户B')]
    const resources = [
      resource('r-1', 'm-b'),
      resource('r-2', 'm-a'),
      resource('r-3', 'm-b'),
    ]

    const sections = groupResourcesByMember(resources, members, 'm-a', '未知成员')

    expect(sections).toHaveLength(2)
    expect(sections[0]?.memberId).toBe('m-a')
    expect(sections[0]?.isSelf).toBe(true)
    expect(sections[0]?.resources.map((item) => item.id)).toEqual(['r-2'])
    expect(sections[1]?.memberId).toBe('m-b')
    expect(sections[1]?.resources.map((item) => item.id)).toEqual(['r-1', 'r-3'])
  })

  it('falls back to unknown label when member is missing', () => {
    const sections = groupResourcesByMember(
      [resource('r-1', 'missing-member')],
      [],
      null,
      '未知成员',
    )

    expect(sections[0]?.displayName).toBe('未知成员')
  })
})
