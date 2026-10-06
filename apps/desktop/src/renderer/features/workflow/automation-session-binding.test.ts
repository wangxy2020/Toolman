import { describe, expect, it } from 'vitest'
import type { Session } from '@toolman/shared'
import { pruneOrphanAutomationSessions } from './automation-session-binding'

function session(partial: Partial<Session> & Pick<Session, 'id' | 'title' | 'assistantId'>): Session {
  return {
    workspaceId: 'ws',
    createdAt: 1,
    updatedAt: 1,
    metadata: {},
    ...partial,
  } as Session
}

describe('pruneOrphanAutomationSessions', () => {
  it('removes every automation topic that is not linked to a workflow item', async () => {
    const deleted: string[] = []
    const sessions = [
      session({ id: 'linked', title: '1 测试', assistantId: 'auto' }),
      session({ id: 'twin', title: '1 测试', assistantId: 'auto' }),
      session({ id: 'orphan-new', title: '新子任务', assistantId: 'auto' }),
      session({ id: 'other', title: 'Keep me', assistantId: 'auto' }),
      session({ id: 'classroom', title: '1 测试', assistantId: 'class' }),
    ]
    const count = await pruneOrphanAutomationSessions({
      automationAssistantId: 'auto',
      linkedSessionIds: new Set(['linked']),
      sessions,
      deleteSession: async (id) => {
        deleted.push(id)
      },
    })
    expect(count).toBe(3)
    expect(deleted.sort()).toEqual(['orphan-new', 'other', 'twin'])
  })
})
