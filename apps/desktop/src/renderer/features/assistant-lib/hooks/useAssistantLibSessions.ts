import { useMemo } from 'react'
import {
  ASSISTANT_LIB_ASSISTANT_NAME,
  isAssistantLibSession,
  type Assistant,
  type Session,
} from '@toolman/shared'

export function useAssistantLibSessions(assistants: Assistant[], sessions: Session[]) {
  const sharedAssistant = useMemo(
    () => assistants.find((item) => item.name.trim() === ASSISTANT_LIB_ASSISTANT_NAME) ?? null,
    [assistants],
  )

  const learningSessions = useMemo(() => {
    const underShared = sharedAssistant
      ? sessions.filter(
          (session) =>
            session.assistantId === sharedAssistant.id && isAssistantLibSession(session.metadata),
        )
      : []
    const list =
      underShared.length > 0
        ? underShared
        : sessions.filter((session) => isAssistantLibSession(session.metadata))
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [sessions, sharedAssistant])

  return {
    sharedAssistant,
    learningSessions,
  }
}
