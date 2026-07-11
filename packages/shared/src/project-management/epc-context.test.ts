import { describe, expect, it } from 'vitest'

import {
  buildProjectManagementSessionMetadata,
  parseProjectManagementSessionMetadata,
  resolveProjectManagementSessionForTab,
  type ProjectManagementSessionCandidate,
} from './agent-link.js'
import { buildProjectManagementRuntimeHint } from './epc-context.js'

function session(
  partial: Partial<ProjectManagementSessionCandidate> & Pick<ProjectManagementSessionCandidate, 'id'>,
): ProjectManagementSessionCandidate {
  return {
    assistantId: 'assistant-1',
    title: '工作台',
    metadata: {},
    messageCount: 0,
    lastMessageAt: null,
    updatedAt: 0,
    ...partial,
  }
}

describe('project management agent link metadata', () => {
  it('round-trips session metadata', () => {
    const metadata = buildProjectManagementSessionMetadata('cost_management')
    const parsed = parseProjectManagementSessionMetadata(metadata)
    expect(parsed).toEqual({ tab: 'cost_management', dataSource: 'sqlite' })
  })
})

describe('resolveProjectManagementSessionForTab', () => {
  it('prefers metadata.tab over duplicate titles', () => {
    const sessions = [
      session({
        id: 'empty-workbench',
        title: '工作台',
        messageCount: 0,
      }),
      session({
        id: 'real-workbench',
        title: '工作台',
        messageCount: 12,
        metadata: buildProjectManagementSessionMetadata('all_projects'),
      }),
      session({
        id: 'schedule',
        title: '计划管理',
        messageCount: 4,
        metadata: buildProjectManagementSessionMetadata('progress_management'),
      }),
    ]

    expect(resolveProjectManagementSessionForTab(sessions, 'assistant-1', 'all_projects')?.id).toBe(
      'real-workbench',
    )
    expect(
      resolveProjectManagementSessionForTab(sessions, 'assistant-1', 'progress_management')?.id,
    ).toBe('schedule')
  })

  it('falls back to the busiest legacy title match when metadata is missing', () => {
    const sessions = [
      session({ id: 'old', title: '工作台', messageCount: 2 }),
      session({ id: 'current', title: '工作台', messageCount: 18 }),
      session({ id: 'new-empty', title: '工作台', messageCount: 0 }),
    ]

    expect(resolveProjectManagementSessionForTab(sessions, 'assistant-1', 'all_projects')?.id).toBe(
      'current',
    )
  })
})

describe('buildProjectManagementRuntimeHint', () => {
  it('includes portfolio summary for cost tab', () => {
    const hint = buildProjectManagementRuntimeHint('cost_management')
    expect(hint).toContain('成本管理')
    expect(hint).toContain('EPC-2401')
    expect(hint).toContain('合同总额')
  })

  it('includes progress fields for schedule tab', () => {
    const hint = buildProjectManagementRuntimeHint('progress_management')
    expect(hint).toContain('计划管理')
    expect(hint).toContain('进度')
  })
})
