import { P2pSharedResourceRepository } from '@toolman/db'
import {
  P2pAgentRemoveSessionsInputSchema,
  P2pAgentSetSessionPermissionInputSchema,
  type P2pSharedResource,
} from '@toolman/shared'
import { getDatabase } from '../../../bootstrap/database'
import { getDefaultWorkspace } from '../../workspace.service'
import { appendP2pEvent } from '../p2p-event.service'
import { assertCanManageSharedResource } from '../p2p-permission.guard'
import { mapP2pAgentSharedResourceRow } from './mapping'
import { readAgentShareMetadata, serializeAgentShareMetadata } from './metadata'
import { listAssistantSessionIds, mergeSessionTitles } from './sessions'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

export async function removeP2pAgentSessions(
  rawInput: unknown,
): Promise<{ sharedResource: P2pSharedResource | null }> {
  const input = P2pAgentRemoveSessionsInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Agent') {
    throw new Error('只能修改智能体共享资源')
  }

  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)
  const metadata = readAgentShareMetadata(resource.metadataJson)
  const assistantId = resource.localResourceId ?? resource.id
  const sourceWorkspaceId = metadata.sourceWorkspaceId ?? getDefaultWorkspace()?.id
  if (!sourceWorkspaceId) {
    throw new Error('工作区未就绪')
  }

  const allSessionIds = listAssistantSessionIds(sourceWorkspaceId, assistantId)
  const currentIds = metadata.sessionIds ?? allSessionIds
  const removeSet = new Set(input.sessionIds)
  const nextIds = currentIds.filter((id) => !removeSet.has(id))

  if (nextIds.length === currentIds.length) {
    throw new Error('未能移除所选话题')
  }

  if (nextIds.length === 0) {
    const metadataJson = serializeAgentShareMetadata({
      sourceWorkspaceId,
      packageJson: metadata.packageJson,
    })
    sharedRepo.update({ id: resource.id, status: 'unshared', metadataJson })
    await appendP2pEvent({
      workspaceId: input.workspaceId,
      resourceType: 'Agent',
      resourceId: resource.id,
      operatorId: member.id,
      eventType: 'Deleted',
      payload: {
        assistant_id: assistantId,
      },
    })
    return { sharedResource: null }
  }

  if (!metadata.packageJson) {
    throw new Error('智能体共享元数据不完整')
  }

  const nextTitles = mergeSessionTitles(metadata.sessionTitles, {}, nextIds)
  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson: metadata.packageJson,
    sessionIds: nextIds,
    sessionTitles: nextTitles,
    sessionPermissions: Object.fromEntries(
      Object.entries(metadata.sessionPermissions ?? {}).filter(([id]) => !removeSet.has(id)),
    ),
  })
  const updated =
    sharedRepo.update({
      id: resource.id,
      metadataJson,
    }) ?? resource

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Agent',
    resourceId: resource.id,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      assistant_id: assistantId,
      name: updated.name,
      package_json: metadata.packageJson,
      source_workspace_id: sourceWorkspaceId,
      session_ids: nextIds,
      ...(nextTitles ? { session_titles: nextTitles } : {}),
      ...(metadata.sessionPermissions
        ? {
            session_permissions: Object.fromEntries(
              Object.entries(metadata.sessionPermissions).filter(([id]) => !removeSet.has(id)),
            ),
          }
        : {}),
    },
  })

  return { sharedResource: mapP2pAgentSharedResourceRow(updated) }
}

export async function setP2pAgentSessionPermission(rawInput: unknown): Promise<{
  sharedResource: P2pSharedResource
}> {
  const input = P2pAgentSetSessionPermissionInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Agent' || resource.status !== 'active') {
    throw new Error('共享资源不存在')
  }

  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)
  const metadata = readAgentShareMetadata(resource.metadataJson)
  const assistantId = resource.localResourceId ?? resource.id
  const sourceWorkspaceId = metadata.sourceWorkspaceId ?? getDefaultWorkspace()?.id
  if (!sourceWorkspaceId || !metadata.packageJson) {
    throw new Error('智能体共享元数据不完整')
  }

  const sharedSessionIds =
    metadata.sessionIds ?? listAssistantSessionIds(sourceWorkspaceId, assistantId)
  if (!sharedSessionIds.includes(input.sessionId)) {
    throw new Error('话题未共享到群组')
  }

  const sessionPermissions = {
    ...(metadata.sessionPermissions ?? {}),
    [input.sessionId]: input.permission,
  }
  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson: metadata.packageJson,
    sessionIds: metadata.sessionIds,
    sessionTitles: metadata.sessionTitles,
    sessionPermissions,
  })

  const updated =
    sharedRepo.update({
      id: resource.id,
      metadataJson,
    }) ?? resource

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Agent',
    resourceId: resource.id,
    operatorId: member.id,
    eventType: 'Updated',
    payload: {
      assistant_id: assistantId,
      session_id: input.sessionId,
      session_permission: input.permission,
      session_permissions: sessionPermissions,
    },
  })

  return { sharedResource: mapP2pAgentSharedResourceRow(updated) }
}
