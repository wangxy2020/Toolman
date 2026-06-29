import { P2pSharedResourceRepository } from '@toolman/db'
import { P2pAgentShareInputSchema, type P2pSharedResource } from '@toolman/shared'
import { getDatabase } from '../../../bootstrap/database'
import { listAssistants } from '../../assistant.service'
import { getDefaultWorkspace } from '../../workspace.service'
import { appendP2pEvent } from '../p2p-event.service'
import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from '../p2p-shared-resource-id'
import { assertCanShareResource } from '../p2p-permission.guard'
import { clearGroupMirrorFlagFromSourceAssistant } from './mirror'
import { mapP2pAgentSharedResourceRow } from './mapping'
import { readAgentShareMetadata, serializeAgentShareMetadata } from './metadata'
import { buildAgentPackageFromAssistant } from './package'
import {
  listAssistantSessionIds,
  listAssistantSessionTitles,
  mergeSessionTitles,
  mergeSharedSessionIds,
} from './sessions'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function getAssistantInWorkspace(assistantId: string, workspaceId: string) {
  const assistants = listAssistants({ workspaceId, pinnedOnly: false })
  return assistants.find((item) => item.id === assistantId) ?? null
}

export async function shareP2pAgent(rawInput: unknown): Promise<{ sharedResource: P2pSharedResource }> {
  const input = P2pAgentShareInputSchema.parse(rawInput)
  const member = assertCanShareResource(input.workspaceId)
  const sourceWorkspaceId = input.sourceWorkspaceId ?? getDefaultWorkspace()?.id
  if (!sourceWorkspaceId) {
    throw new Error('工作区未就绪')
  }

  const assistant = getAssistantInWorkspace(input.assistantId, sourceWorkspaceId)
  if (!assistant) {
    throw new Error('智能体不存在')
  }
  if (assistant.parameters?.p2pGroupProxy) {
    throw new Error('不能共享群组虚拟智能体')
  }

  clearGroupMirrorFlagFromSourceAssistant(assistant.id)

  const agentPackage = buildAgentPackageFromAssistant(assistant)
  const packageJson = JSON.stringify(agentPackage)
  const shareWholeAgent = !input.sessionIds || input.sessionIds.length === 0
  const sharedRepo = getSharedResourceRepo()
  let resource = findSharedResourceInWorkspace(
    sharedRepo,
    input.workspaceId,
    assistant.id,
    'Agent',
  )

  const existingMetadata = resource ? readAgentShareMetadata(resource.metadataJson) : {}
  const allSessionIds = listAssistantSessionIds(sourceWorkspaceId, assistant.id)
  const sessionIds = shareWholeAgent
    ? allSessionIds
    : mergeSharedSessionIds(existingMetadata.sessionIds, input.sessionIds)
  const sessionTitles = mergeSessionTitles(
    existingMetadata.sessionTitles,
    listAssistantSessionTitles(sourceWorkspaceId, assistant.id, sessionIds),
    sessionIds,
  )

  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson,
    sessionIds,
    sessionTitles,
    sessionPermissions: existingMetadata.sessionPermissions,
  })

  if (!resource) {
    resource = sharedRepo.create({
      id: resolveSharedResourceId(sharedRepo, assistant.id, input.workspaceId),
      workspaceId: input.workspaceId,
      resourceType: 'Agent',
      localResourceId: assistant.id,
      name: assistant.name,
      sharedBy: member.id,
      permission: input.permission ?? 'read',
      metadataJson,
    })
  } else if (resource.status !== 'active') {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: assistant.name,
        status: 'active',
        metadataJson,
      }) ?? resource
  } else {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: assistant.name,
        metadataJson,
      }) ?? resource
  }

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Agent',
    resourceId: resource.id,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      assistant_id: assistant.id,
      name: assistant.name,
      package_json: packageJson,
      source_workspace_id: sourceWorkspaceId,
      permission: input.permission ?? 'read',
      session_ids: sessionIds ?? [],
      ...(sessionTitles ? { session_titles: sessionTitles } : {}),
      ...(existingMetadata.sessionPermissions
        ? { session_permissions: existingMetadata.sessionPermissions }
        : {}),
    },
  })

  return { sharedResource: mapP2pAgentSharedResourceRow(resource) }
}
