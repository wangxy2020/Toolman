import { describe, expect, it, vi } from 'vitest'
import { assistantLibSessionMetadataPatch, type Assistant, type Session } from '@toolman/shared'
import {
  ensureActiveClassroomChatSession,
  healClassroomChatOrphans,
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

  it('switches from a blank shell to a course topic when courses exist', async () => {
    const createSession = vi.fn(async () => null)
    const selectSession = vi.fn(async () => {})
    const blank = session({
      id: 'blank',
      title: '开始上课。请根据本课…',
      assistantId: 'class',
      updatedAt: 9,
      messageCount: 4,
    })
    const course = session({
      id: 'course-1',
      title: '高中化学必修1',
      assistantId: 'class',
      metadata: classroomMeta,
      updatedAt: 2,
      messageCount: 0,
    })

    const result = await ensureActiveClassroomChatSession({
      classroomAssistant,
      chat: {
        sessions: [blank, course],
        activeSession: blank,
        createSession,
        selectSession,
      },
      preferredSessionId: null,
    })

    expect(result?.id).toBe('course-1')
    expect(selectSession).toHaveBeenCalledWith('course-1')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('heals orphan start-class chats into the empty course topic', async () => {
    const orphan = session({
      id: 'orphan',
      title: '开始上课。请根据本课教学大纲…',
      assistantId: 'class',
      messageCount: 4,
      updatedAt: 9,
      metadata: { socraticState: { mastered: ['a'] } },
    })
    const course = session({
      id: 'course',
      title: '高中化学必修1',
      assistantId: 'class',
      metadata: classroomMeta,
      messageCount: 0,
      updatedAt: 2,
    })
    const updateSession = vi.fn(async () => orphan)
    const deleteSession = vi.fn(async () => true)

    const result = await healClassroomChatOrphans({
      classroomAssistantId: 'class',
      sessions: [orphan, course],
      updateSession,
      deleteSession,
    })

    expect(result).toEqual({
      healed: true,
      keepSessionId: 'orphan',
      dropSessionId: 'course',
    })
    expect(updateSession).toHaveBeenCalledWith(
      'orphan',
      expect.objectContaining({ title: '课程' }),
    )
    expect(deleteSession).toHaveBeenCalledWith('course')
  })
})
