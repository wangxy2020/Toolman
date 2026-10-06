import { IpcChannel, type Assistant, type Session } from '@toolman/shared'
import type { LocalWorkflowItem } from './workflow-types'

type ChatLike = {
  sessions: Session[]
  activeSession: Session | null
  createSession: (assistantId?: string) => Promise<Session | null>
  selectSession: (sessionId: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<unknown> | unknown
  deleteSession?: (id: string) => Promise<unknown>
}

export function isAutomationOwnedSession(
  session: Session | null | undefined,
  automationAssistantId: string | undefined,
): boolean {
  if (!session?.assistantId || !automationAssistantId) return false
  return session.assistantId === automationAssistantId
}

async function resolveSessionById(
  chat: ChatLike,
  sessionId: string,
): Promise<Session | null> {
  const cached = chat.sessions.find((session) => session.id === sessionId)
  if (cached) return cached

  const result = await window.api.invoke(IpcChannel.SessionGet, { id: sessionId })
  if (!result.ok) return null
  return (result.data as Session | null) ?? null
}

/** Prevent StrictMode / overlapping effects from creating twin sessions per subtask. */
const bindInFlight = new Map<string, Promise<Session | null>>()

/**
 * Ensure a subtask chats under the「自动化」assistant.
 * Rebinds when a legacy session was created under 课堂 / 通用智能体.
 */
export async function bindAutomationSubTaskSession(options: {
  item: LocalWorkflowItem
  automationAssistant: Assistant
  chat: ChatLike
  linkSession: (id: string, sessionId: string) => Promise<void>
}): Promise<Session | null> {
  const { item, automationAssistant, chat, linkSession } = options
  const assistantId = automationAssistant.id
  const inflight = bindInFlight.get(item.id)
  if (inflight) return inflight

  const promise = (async () => {
    if (item.sessionId) {
      const existing = await resolveSessionById(chat, item.sessionId)
      if (isAutomationOwnedSession(existing, assistantId)) {
        await chat.selectSession(existing!.id)
        return existing
      }
    }

    // Prefer an already-linked / same-titled automation session before creating another.
    const titled = chat.sessions.find(
      (session) =>
        session.assistantId === assistantId &&
        session.title.trim() === item.name.trim(),
    )
    if (titled) {
      await chat.selectSession(titled.id)
      if (item.sessionId !== titled.id) {
        await linkSession(item.id, titled.id)
      }
      return titled
    }

    const created = await chat.createSession(assistantId)
    if (!created) return null
    await chat.renameSession(created.id, item.name)
    await linkSession(item.id, created.id)
    return created
  })().finally(() => {
    bindInFlight.delete(item.id)
  })

  bindInFlight.set(item.id, promise)
  return promise
}

/** Switch away from 课堂 (or any non-automation) session while on the Automation page. */
export async function ensureActiveAutomationChatSession(options: {
  automationAssistant: Assistant
  chat: ChatLike
  preferredSessionId?: string | null
}): Promise<Session | null> {
  const { automationAssistant, chat, preferredSessionId } = options
  const assistantId = automationAssistant.id

  if (preferredSessionId) {
    const preferred = await resolveSessionById(chat, preferredSessionId)
    if (isAutomationOwnedSession(preferred, assistantId)) {
      if (chat.activeSession?.id !== preferred!.id) {
        await chat.selectSession(preferred!.id)
      }
      return preferred
    }
  }

  if (isAutomationOwnedSession(chat.activeSession, assistantId)) {
    return chat.activeSession
  }

  const existing = chat.sessions
    .filter((session) => session.assistantId === assistantId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]

  if (existing) {
    await chat.selectSession(existing.id)
    return existing
  }

  // Prefer listing by assistant so we don't miss sessions outside the default 50.
  return chat.createSession(assistantId)
}

/**
 * Drop automation chat topics that are not linked to a workflow task or subtask.
 * The agent sidebar lists these sessions, so leftovers show as extra topics.
 */
export async function pruneOrphanAutomationSessions(options: {
  automationAssistantId: string
  linkedSessionIds: ReadonlySet<string>
  sessions: readonly Session[]
  deleteSession: (id: string) => Promise<unknown>
  activeSessionId?: string | null
}): Promise<number> {
  const {
    automationAssistantId,
    linkedSessionIds,
    sessions,
    deleteSession,
    activeSessionId,
  } = options
  const orphans = sessions.filter((session) => {
    if (session.assistantId !== automationAssistantId) return false
    if (linkedSessionIds.has(session.id)) return false
    if (session.id === activeSessionId) return false
    return true
  })
  for (const session of orphans) {
    await deleteSession(session.id)
  }
  return orphans.length
}
