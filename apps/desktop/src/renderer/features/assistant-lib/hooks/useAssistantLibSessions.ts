import { useMemo } from 'react'
import {
  isAssistantLibAssistantName,
  isAssistantLibSession,
  resolveCanonicalAssistantLibAssistant,
  type Assistant,
  type Session,
} from '@toolman/shared'

export function useAssistantLibSessions(assistants: Assistant[], sessions: Session[]) {
  const sharedAssistant = useMemo(
    () => resolveCanonicalAssistantLibAssistant(assistants, sessions),
    [assistants, sessions],
  )

  const classroomAssistantIds = useMemo(() => {
    const ids = new Set(
      assistants.filter((item) => isAssistantLibAssistantName(item.name)).map((item) => item.id),
    )
    return ids
  }, [assistants])

  const learningSessions = useMemo(() => {
    // Merge course topics across duplicate「课堂」agents so classroom / agent pages match.
    const list = sessions.filter(
      (session) =>
        isAssistantLibSession(session.metadata) &&
        (!session.assistantId || classroomAssistantIds.has(session.assistantId)),
    )
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [sessions, classroomAssistantIds])

  return {
    sharedAssistant,
    learningSessions,
  }
}
