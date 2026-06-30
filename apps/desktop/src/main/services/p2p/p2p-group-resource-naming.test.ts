import { describe, expect, it, vi } from 'vitest'

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({}),
}))

vi.mock('../workspace.service', () => ({
  getDefaultWorkspace: () => ({ id: 'personal-ws' }),
}))

vi.mock('@toolman/db', () => {
  class P2pWorkspaceRepository {
    findById(id: string) {
      if (id === 'group-ws') {
        return { id: 'group-ws', name: '产品讨论组' }
      }
      return null
    }
  }

  return { P2pWorkspaceRepository }
})

import {
  buildGroupPrefixedName,
  buildGroupVirtualAgentName,
  resolveGroupProxyAssistantDisplayName,
  resolvePersonalStorageWorkspaceId,
  stripGroupPrefixedName,
} from './p2p-group-resource-naming'

describe('p2p group resource naming', () => {
  it('resolvePersonalStorageWorkspaceId returns default workspace id', () => {
    expect(resolvePersonalStorageWorkspaceId()).toBe('personal-ws')
  })

  it('stripGroupPrefixedName removes canonical group prefix', () => {
    expect(stripGroupPrefixedName('group-ws', '[产品讨论组] 共享笔记')).toBe('共享笔记')
  })

  it('buildGroupPrefixedName applies canonical group prefix', () => {
    expect(buildGroupPrefixedName('group-ws', '共享笔记')).toBe('[产品讨论组] 共享笔记')
    expect(buildGroupPrefixedName('missing-ws', '共享笔记')).toBe('[群组] 共享笔记')
  })

  it('buildGroupVirtualAgentName avoids double prefixing', () => {
    expect(buildGroupVirtualAgentName('group-ws', '代码助手')).toBe('[产品讨论组] 代码助手')
    expect(buildGroupVirtualAgentName('group-ws', '[产品讨论组] 代码助手')).toBe(
      '[产品讨论组] 代码助手',
    )
    expect(buildGroupVirtualAgentName('group-ws', '代码助手', '自定义组')).toBe('[自定义组] 代码助手')
  })
})

describe('resolveGroupProxyAssistantDisplayName', () => {
  it('prefixes plain shared agent name with canonical group name', () => {
    expect(resolveGroupProxyAssistantDisplayName('group-ws', '代码助手')).toBe(
      '[产品讨论组] 代码助手',
    )
  })

  it('strips an existing group prefix before re-applying canonical prefix', () => {
    expect(resolveGroupProxyAssistantDisplayName('group-ws', '[产品讨论组] 代码助手')).toBe(
      '[产品讨论组] 代码助手',
    )
  })

  it('replaces mismatched translated or stale prefixes', () => {
    expect(resolveGroupProxyAssistantDisplayName('group-ws', '[Default Group] 代码助手')).toBe(
      '[产品讨论组] 代码助手',
    )
  })
})
