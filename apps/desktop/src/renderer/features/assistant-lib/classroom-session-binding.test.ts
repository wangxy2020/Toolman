import { describe, expect, it, vi } from 'vitest'
import { assistantLibSessionMetadataPatch, type Assistant, type Session } from '@toolman/shared'
import {
  ensureActiveClassroomChatSession,
  isClassroomOwnedSession,
} from './classroom-session-binding'

const classroomMeta = assistantLibSessionMetadataPatch(null, {
  presetId: 'open',
  courseName: '课程',
})

function session(
  partial: Partial<Session> & Pick<Session, 'id' | 'title' | 'assistantId'>,
): Session {
  return {
    workspaceId: 'ws',
    createdAt: 1,
    updatedAt: 1,
    metadata: {},
    ...partial,
  } as Session
}

const classroomAssistant = { id: 'class', name: '助手课堂' } as Assistant

describe('isClassroomOwnedSession', () => {
  it('matches by classroom assistant id only', () => {
    expect(
      isClassroomOwnedSession(
        session({ id: 'blank', title: '新话题', assistantId: 'class' }),
        'class',
      ),
    ).toBe(true)
    expect(
      isClassroomOwnedSession(
        session({
          id: 'course',
          title: '课',
          assistantId: 'class',
          metadata: classroomMeta,
        }),
        'class',
      ),
    ).toBe(true)
    expect(
      isClassroomOwnedSession(
        session({ id: 'a1', title: '话题', assistantId: 'agent' }),
        'class',
      ),
    ).toBe(false)
  })
})

describe('ensureActiveClassroomChatSession', () => {
  it('creates a blank classroom topic when no course exists', async () => {
    const created = session({ id: 'blank', title: '新话题', assistantId: 'class' })
    const createSession = vi.fn(async () => created)
    const selectSession = vi.fn(async () => {})
    const agent = session({
      id: 'agent-topic',
      title: '智能体话题',
      assistantId: 'agent',
    })

    const result = await ensureActiveClassroomChatSession({
      classroomAssistant,
      chat: {
        sessions: [agent],
        activeSession: agent,
        createSession,
        selectSession,
      },
      preferredSessionId: null,
    })

    expect(result?.id).toBe('blank')
    expect(createSession).toHaveBeenCalledWith('class')
    expect(selectSession).not.toHaveBeenCalled()
  })

  it('selects the preferred classroom course when active chat is foreign', async () => {
    const createSession = vi.fn(async () => null)
    const selectSession = vi.fn(async () => {})
    const course = session({
      id: 'course-1',
      title: '课程',
      assistantId: 'class',
      metadata: classroomMeta,
      updatedAt: 2,
    })
    const agent = session({
      id: 'agent-topic',
      title: '智能体话题',
      assistantId: 'agent',
      updatedAt: 3,
    })

    const result = await ensureActiveClassroomChatSession({
      classroomAssistant,
      chat: {
        sessions: [agent, course],
        activeSession: agent,
        createSession,
        selectSession,
      },
      preferredSessionId: course.id,
    })

    expect(result?.id).toBe('course-1')
    expect(selectSession).toHaveBeenCalledWith('course-1')
    expect(createSession).not.toHaveBeenCalled()
  })
})
