import { useMemo } from 'react'
import {
  isAssistantLibAssistantName,
  isAssistantLibSession,
  type Assistant,
  type Session,
} from '@toolman/shared'

export function useAssistantLibSessions(assistants: Assistant[], sessions: Session[]) {
  const sharedAssistant = useMemo(
    () => assistants.find((item) => isAssistantLibAssistantName(item.name)) ?? null,
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
