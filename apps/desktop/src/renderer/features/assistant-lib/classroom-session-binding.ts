import {
  isAssistantLibSession,
  looksLikeAssistantLibDefaultClassroom,
  parseAssistantLibSessionMeta,
  type Assistant,
  type Session,
} from '@toolman/shared'

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

function isCourseTopic(session: Session): boolean {
  return isAssistantLibSession(session.metadata) && !looksLikeAssistantLibDefaultClassroom(session)
}

function sortByRecent(sessions: Session[]): Session[] {
  return [...sessions].sort((left, right) => right.updatedAt - left.updatedAt)
}

/**
 * Bind the shared chat pane to a classroom session while on 课堂.
 * Prefer real course topics over blank「新对话」shells so上课消息不会落到错误话题。
 */
export async function ensureActiveClassroomChatSession(options: {
  classroomAssistant: Assistant
  chat: ChatLike
  preferredSessionId?: string | null
}): Promise<Session | null> {
  const { classroomAssistant, chat, preferredSessionId } = options
  const assistantId = classroomAssistant.id
  const owned = sortByRecent(
    chat.sessions.filter((session) => isClassroomOwnedSession(session, assistantId)),
  )
  const courses = owned.filter((session) => isCourseTopic(session))

  if (preferredSessionId) {
    const preferred =
      chat.sessions.find((session) => session.id === preferredSessionId) ?? null
    if (isClassroomOwnedSession(preferred, assistantId)) {
      if (chat.activeSession?.id !== preferred!.id) {
        await chat.selectSession(preferred!.id)
      }
      return preferred
    }
  }

  // Keep the current course topic; do not keep a blank shell when courses exist.
  const active = chat.activeSession
  if (active && isClassroomOwnedSession(active, assistantId)) {
    if (isCourseTopic(active) || courses.length === 0) {
      return active
    }
  }

  const latestCourse = courses[0]
  if (latestCourse) {
    try {
      await chat.selectSession(latestCourse.id)
      return latestCourse
    } catch {
      // fall through
    }
  }

  const existing = owned[0]
  if (existing) {
    try {
      await chat.selectSession(existing.id)
      return existing
    } catch {
      // Session may have been pruned while switching modules; create a fresh one.
    }
  }

  // Only create a blank shell when there is no course topic at all.
  return chat.createSession(assistantId)
}

/**
 * If上课 messages landed on a blank classroom shell while the real course topic
 * stayed empty, fold the shell into the course (keep messages, restore course title/meta).
 */
export async function healClassroomChatOrphans(options: {
  classroomAssistantId: string
  sessions: Session[]
  updateSession: (
    sessionId: string,
    patch: { title: string; metadata: Record<string, unknown> },
  ) => Promise<Session | null>
  deleteSession: (sessionId: string) => Promise<boolean>
}): Promise<{ healed: boolean; keepSessionId?: string; dropSessionId?: string }> {
  const owned = options.sessions.filter(
    (session) => session.assistantId === options.classroomAssistantId,
  )
  const courses = owned.filter((session) => isCourseTopic(session))
  const orphans = owned.filter(
    (session) => !isAssistantLibSession(session.metadata) && (session.messageCount ?? 0) > 0,
  )

  for (const orphan of orphans) {
    const emptyCourse =
      courses.find((course) => (course.messageCount ?? 0) === 0) ??
      courses.find((course) => (course.messageCount ?? 0) < (orphan.messageCount ?? 0))
    if (!emptyCourse) continue
    const meta = parseAssistantLibSessionMeta(emptyCourse.metadata)
    if (!meta) continue

    const title = meta.courseName?.trim() || emptyCourse.title
    const metadata: Record<string, unknown> = {
      ...(emptyCourse.metadata ?? {}),
      ...(orphan.metadata?.socraticState
        ? { socraticState: orphan.metadata.socraticState }
        : {}),
    }
    const updated = await options.updateSession(orphan.id, { title, metadata })
    if (!updated) continue
    const deleted = await options.deleteSession(emptyCourse.id)
    if (!deleted) continue
    return { healed: true, keepSessionId: orphan.id, dropSessionId: emptyCourse.id }
  }

  return { healed: false }
}
