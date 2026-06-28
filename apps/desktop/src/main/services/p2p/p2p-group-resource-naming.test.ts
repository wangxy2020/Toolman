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

import { resolveGroupProxyAssistantDisplayName } from './p2p-group-resource-naming'

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
