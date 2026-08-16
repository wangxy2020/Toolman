import { describe, expect, it } from 'vitest'
import type { ChatSession, MobileAgent } from '../state/MobileAppContext'
import type { GroupSharedItem } from '../storage/groupChat'
import {
  formatGroupVirtualAgentName,
  groupAgentSessionsForSidebar,
  groupSharedAgentSections,
} from './groupAgentUtils'

function item(partial: Partial<GroupSharedItem> & Pick<GroupSharedItem, 'id' | 'name'>): GroupSharedItem {
  return {
    kind: 'agents',
    addedAt: 1,
    ...partial,
  }
}

describe('groupSharedAgentSections', () => {
  it('nests authorized topics under the shared agent', () => {
    const sections = groupSharedAgentSections([
      item({ id: 'ag-1', name: '助手' }),
      item({
        id: 'sess-1',
        name: '问候',
        parentId: 'ag-1',
        parentName: '助手',
        sessionPermission: 'callable',
      }),
      item({
        id: 'sess-2',
        name: '规划',
        parentId: 'ag-1',
        sessionPermission: 'read',
      }),
    ])
    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe('助手')
    expect(sections[0]?.topics.map((topic) => topic.name)).toEqual(['问候', '规划'])
    expect(sections[0]?.topics[0]?.permission).toBe('callable')
  })
})

describe('groupAgentSessionsForSidebar', () => {
  it('groups personal topics under local agents and proxy under [群组]', () => {
    const agents: MobileAgent[] = [
      { id: 'asst-1', name: '默认智能体', agentScope: 'agent', createdAt: 1 },
    ]
    const personal: ChatSession = {
      id: 'p1',
      title: '我的话题',
      updatedAt: 2,
      messages: [],
      agentScope: 'agent',
      assistantId: 'asst-1',
    }
    const proxy: ChatSession = {
      id: 'g1',
      title: '问候',
      updatedAt: 3,
      messages: [],
      agentScope: 'agent',
      groupAgent: {
        workspaceId: 'ws',
        resourceId: 'ag-1',
        sourceSessionId: 'sess-1',
        sourceAssistantId: 'ag-1',
        groupName: '研发',
        sharedAgentName: '助手',
        permission: 'callable',
        ownerMemberId: 'm1',
      },
    }
    const sections = groupAgentSessionsForSidebar([personal, proxy], agents)
    expect(sections[0]?.title).toBe('默认智能体')
    expect(sections[0]?.assistantId).toBe('asst-1')
    expect(sections[0]?.sessions[0]?.id).toBe('p1')
    expect(sections[1]?.title).toBe(formatGroupVirtualAgentName('研发', '助手'))
    expect(sections[1]?.sessions[0]?.id).toBe('g1')
  })
})
