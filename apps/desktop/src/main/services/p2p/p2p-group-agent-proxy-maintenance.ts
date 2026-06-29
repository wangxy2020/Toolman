import { eq } from 'drizzle-orm'
import { assistants } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getSessionRepository } from '../../db/repos'
import { toIpcSession } from '../../mappers/chat'
import { updateAssistant } from '../assistant.service'
import { deleteSession } from '../session.service'
import { getDefaultWorkspace } from '../workspace.service'
import { readAgentShareMetadata } from './agent-share.service'
import { readSessionProxyMetadata } from './p2p-group-agent-proxy-metadata'
import { resolveSharedAgentModelId } from './p2p-group-agent-proxy-model'

export function parseAgentSharePermissionForSession(
  metadataJson: string | null | undefined,
  sourceSessionId: string,
): 'read' | 'callable' {
  const metadata = readAgentShareMetadata(metadataJson)
  return metadata.sessionPermissions?.[sourceSessionId] ?? 'read'
}

export function syncGroupProxyAssistantModels(workspaceId: string): void {
  const db = getDatabase()
  const rows = db
    .select()
    .from(assistants)
    .where(eq(assistants.workspaceId, workspaceId))
    .all()

  for (const row of rows) {
    if (row.deletedAt) continue

    const params = JSON.parse(row.parametersJson) as Record<string, unknown>
    const proxy = params.p2pGroupProxy as
      | { resourceId?: string; p2pWorkspaceId?: string; sourceAssistantId?: string }
      | undefined
    if (!proxy?.resourceId || !proxy.p2pWorkspaceId) continue

    const expectedModelId = resolveSharedAgentModelId(
      row.modelId,
      proxy.p2pWorkspaceId,
      proxy.resourceId,
      proxy.sourceAssistantId,
    )
    if (row.modelId !== expectedModelId) {
      updateAssistant({
        id: row.id,
        modelId: expectedModelId,
      })
    }
  }
}

export function cleanupLocalProxySessionsForResource(
  resourceId: string,
  allowedSourceSessionIds?: ReadonlySet<string>,
): void {
  const personalWorkspace = getDefaultWorkspace()
  if (!personalWorkspace) return

  const rows = getSessionRepository().listRows({
    workspaceId: personalWorkspace.id,
    limit: 10_000,
  })

  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (!proxy || proxy.resourceId !== resourceId) continue
    if (allowedSourceSessionIds?.has(proxy.sourceSessionId)) continue
    deleteSession({ id: row.id })
  }
}

export function syncLocalProxySessionPermissions(input: {
  resourceId: string
  sessionPermissions: Record<string, 'read' | 'callable'>
}): void {
  const personalWorkspace = getDefaultWorkspace()
  if (!personalWorkspace) return

  const rows = getSessionRepository().listRows({
    workspaceId: personalWorkspace.id,
    limit: 10_000,
  })

  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (!proxy || proxy.resourceId !== input.resourceId) continue

    const nextPermission = input.sessionPermissions[proxy.sourceSessionId]
    if (!nextPermission || nextPermission === proxy.permission) continue

    getSessionRepository().update(row.id, {
      metadata: {
        p2pGroupAgent: {
          ...proxy,
          permission: nextPermission,
        },
      },
    })
  }
}

export function toIpcSessionFromId(sessionId: string) {
  const row = getSessionRepository().findRowById(sessionId)
  return row ? toIpcSession(row) : null
}
