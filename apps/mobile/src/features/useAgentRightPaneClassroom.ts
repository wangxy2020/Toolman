import type { AgentChatScope } from '../chat/agentScopes'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import type { ChatSession, MobileAgent } from '../state/MobileAppContext'
import {
  startClassroomSession,
  stopClassroomSession,
  withUpdatedStudyRecords,
} from './classroomClassSession'
import { createEmptyAgentSession } from './agentPaneUtils'

export function ensureAgentRightPaneSession(input: {
  activeSessionId: string | null
  scopedSessions: ChatSession[]
  agentScope: AgentChatScope
  agents: MobileAgent[]
  upsertSession: (session: ChatSession) => void
}): ChatSession | null {
  const { activeSessionId, scopedSessions, agentScope, agents, upsertSession } = input
  if (activeSessionId) {
    const existing = scopedSessions.find((item) => item.id === activeSessionId)
    if (existing) return existing
  }
  if (scopedSessions[0]) return scopedSessions[0]
  if (agentScope === 'classroom') return null
  const assistantId = agents.find((agent) => agent.agentScope === agentScope)?.id
  if (!assistantId) return null
  const created = createEmptyAgentSession(agentScope, assistantId)
  upsertSession(created)
  return created
}

export function toggleAgentRightPaneClass(input: {
  classroomCourse: MobileClassroomCourse | null
  classLive: boolean
  busy: boolean
  classroomCourses: MobileClassroomCourse[]
  setClassroomCourses: (courses: MobileClassroomCourse[]) => void
  abort: () => void
  send: (text: string) => void
}) {
  const { classroomCourse, classLive, busy, classroomCourses, setClassroomCourses, abort, send } =
    input
  if (!classroomCourse) return
  if (classLive) {
    if (busy) abort()
    setClassroomCourses(
      withUpdatedStudyRecords(
        classroomCourses,
        classroomCourse.id,
        stopClassroomSession(classroomCourse),
      ),
    )
    return
  }
  if (busy) return
  const started = startClassroomSession(classroomCourse)
  setClassroomCourses(
    withUpdatedStudyRecords(classroomCourses, classroomCourse.id, started.studyRecords),
  )
  send(started.userMessage)
}
