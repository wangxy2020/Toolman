import { IpcChannel, type Session } from '@toolman/shared'

const SESSION_LIST_PAGE_SIZE = 100

/** Fetch all sessions for one assistant (SessionList limit is max 100 per request). */
export async function listAllAssistantSessions(
  workspaceId: string,
  assistantId: string,
): Promise<Session[]> {
  const items: Session[] = []
  let cursor: string | undefined

  for (;;) {
    const result = await window.api.invoke(IpcChannel.SessionList, {
      workspaceId,
      assistantId,
      pagination: {
        limit: SESSION_LIST_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
    })

    if (!result.ok) {
      throw new Error(result.error.message)
    }

    const data = result.data as { items: Session[]; nextCursor?: string }
    items.push(...data.items)
    if (!data.nextCursor) break
    cursor = data.nextCursor
  }

  return items
}
