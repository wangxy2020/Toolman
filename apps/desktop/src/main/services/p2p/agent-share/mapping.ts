import type { P2pSharedResourceRow } from '@toolman/db'
import type { P2pSharedResource } from '@toolman/shared'
import { readAgentShareMetadata } from './metadata'
import { readSharedAgentModelId } from './model'

export function mapP2pAgentSharedResourceRow(row: P2pSharedResourceRow): P2pSharedResource {
  const base: P2pSharedResource = {
    id: row.id,
    workspaceId: row.workspaceId,
    resourceType: row.resourceType,
    localResourceId: row.localResourceId,
    name: row.name,
    sharedBy: row.sharedBy,
    permission: row.permission,
    contentHash: row.contentHash,
    version: row.version ?? 1,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }

  if (row.resourceType !== 'Agent') {
    return base
  }

  const metadata = readAgentShareMetadata(row.metadataJson)
  const sessionIds = metadata.sessionIds
  const sessionTitles = metadata.sessionTitles ?? {}
  const sharedSessionTitles =
    sessionIds && sessionIds.length > 0
      ? Object.fromEntries(
          sessionIds.map((sessionId) => [sessionId, sessionTitles[sessionId] ?? '未命名话题']),
        )
      : Object.keys(sessionTitles).length > 0
        ? sessionTitles
        : undefined

  return {
    ...base,
    sharedSessionIds: sessionIds,
    sharedSessionTitles,
    sharedSessionPermissions: metadata.sessionPermissions,
    sharedModelId: readSharedAgentModelId(metadata),
    sourceWorkspaceId: metadata.sourceWorkspaceId,
  }
}
