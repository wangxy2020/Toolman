import type { Assistant, Session } from '@toolman/shared'

type ChatLike = {
  sessions: Session[]
  activeSession: Session | null
  createSession: (assistantId?: string) => Promise<Session | null>
  selectSession: (sessionId: string) => Promise<void>
}

/** True when the shared chat pane is bound to the 课堂 assistant (course or blank topic). */
export function isClassroomOwnedSession(
  session: Session | null | undefined,
  classroomAssistantId: string | undefined | null,
): boolean {
  if (!session?.assistantId || !classroomAssistantId) return false
  return session.assistantId === classroomAssistantId
}

/**
 * Bind the shared chat pane to a classroom session while on 课堂.
 * Mirrors automation: when there is no course, keep a blank 课堂 assistant topic
 * so the right pane stays an empty agent chat (not a hint / foreign agent messages).
 */
export async function ensureActiveClassroomChatSession(options: {
  classroomAssistant: Assistant
  chat: ChatLike
  preferredSessionId?: string | null
}): Promise<Session | null> {
  const { classroomAssistant, chat, preferredSessionId } = options
  const assistantId = classroomAssistant.id

  if (preferredSessionId) {
    const preferred = chat.sessions.find((session) => session.id === preferredSessionId) ?? null
    if (isClassroomOwnedSession(preferred, assistantId)) {
      if (chat.activeSession?.id !== preferred!.id) {
        await chat.selectSession(preferred!.id)
      }
      return preferred
    }
  }

  if (isClassroomOwnedSession(chat.activeSession, assistantId)) {
    return chat.activeSession
  }

  const existing = chat.sessions
    .filter((session) => session.assistantId === assistantId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]

  if (existing) {
    try {
      await chat.selectSession(existing.id)
      return existing
    } catch {
      // Session may have been pruned while switching modules; create a fresh one.
    }
  }

  return chat.createSession(assistantId)
}
