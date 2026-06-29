import { eq } from 'drizzle-orm'
import type { P2pGroupAgentProxy } from '@toolman/shared'
import { assistants } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getSessionRepository } from '../../db/repos'
import { listAssistants, restoreAssistantIfDeleted } from '../assistant.service'
import { proxyResourceMatches } from './p2p-group-agent-proxy-model'
import { readSessionProxyMetadata } from './p2p-group-agent-proxy-metadata'

export function findProxySession(
  workspaceId: string,
  relayResourceId: string,
  sourceSessionId: string,
  legacyResourceId?: string,
): string | null {
  const rows = getSessionRepository().listRows({ workspaceId, limit: 10_000 })
  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (
      proxy &&
      proxy.sourceSessionId === sourceSessionId &&
      proxyResourceMatches(proxy, relayResourceId, legacyResourceId)
    ) {
      return row.id
    }
  }
  return null
}

export function findProxyAssistant(
  workspaceId: string,
  relayResourceId: string,
  p2pWorkspaceId: string,
  legacyResourceId?: string,
) {
  const assistantsList = listAssistants({ workspaceId, pinnedOnly: false })
  return (
    assistantsList.find((item) => {
      const proxy = item.parameters.p2pGroupProxy
      return (
        proxy?.p2pWorkspaceId === p2pWorkspaceId &&
        proxyResourceMatches(
          proxy as P2pGroupAgentProxy,
          relayResourceId,
          legacyResourceId,
        )
      )
    }) ?? null
  )
}

export function findOrRestoreProxyAssistant(
  workspaceId: string,
  relayResourceId: string,
  p2pWorkspaceId: string,
  legacyResourceId?: string,
) {
  const active = findProxyAssistant(
    workspaceId,
    relayResourceId,
    p2pWorkspaceId,
    legacyResourceId,
  )
  if (active) return active

  const db = getDatabase()
  const rows = db
    .select()
    .from(assistants)
    .where(eq(assistants.workspaceId, workspaceId))
    .all()

  for (const row of rows) {
    if (!row.deletedAt) continue
    const params = JSON.parse(row.parametersJson) as Record<string, unknown>
    const proxy = params.p2pGroupProxy as P2pGroupAgentProxy | undefined
    if (
      !proxy ||
      proxy.p2pWorkspaceId !== p2pWorkspaceId ||
      !proxyResourceMatches(proxy, relayResourceId, legacyResourceId)
    ) {
      continue
    }
    restoreAssistantIfDeleted(row.id)
    return findProxyAssistant(workspaceId, relayResourceId, p2pWorkspaceId, legacyResourceId)
  }

  return null
}
