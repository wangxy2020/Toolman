import { getSessionRepository } from '../../../db/repos'

export function listAssistantSessionIds(workspaceId: string, assistantId: string): string[] {
  return getSessionRepository()
    .listRows({ workspaceId, assistantId, limit: 10_000 })
    .map((row) => row.id)
}

export function listAssistantSessionTitles(
  workspaceId: string,
  assistantId: string,
  sessionIds?: string[],
): Record<string, string> {
  const allowed = sessionIds ? new Set(sessionIds) : null
  const titles: Record<string, string> = {}
  for (const row of getSessionRepository().listRows({ workspaceId, assistantId, limit: 10_000 })) {
    if (allowed && !allowed.has(row.id)) continue
    titles[row.id] = row.title
  }
  return titles
}

export function mergeSessionTitles(
  existing: Record<string, string> | undefined,
  incoming: Record<string, string>,
  sessionIds?: string[],
): Record<string, string> | undefined {
  const merged = { ...(existing ?? {}), ...incoming }
  if (sessionIds) {
    for (const key of Object.keys(merged)) {
      if (!sessionIds.includes(key)) {
        delete merged[key]
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

export function mergeSharedSessionIds(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (!incoming || incoming.length === 0) {
    return existing
  }
  return [...new Set([...(existing ?? []), ...incoming])]
}
