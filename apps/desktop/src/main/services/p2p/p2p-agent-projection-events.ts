import type { WorkspaceEvent } from '@toolman/shared'
import { getDefaultWorkspace } from '../workspace.service'
import {
  importAgentPackageToWorkspace,
  parseAgentSessionPermissionsFromPayload,
  parseAgentSessionTitlesFromPayload,
  readAgentShareMetadata,
  serializeAgentShareMetadata,
} from './agent-share.service'
import { resolveGroupMirrorImportAssistantId } from '../assistant.service'
import {
  cleanupLocalProxySessionsForResource,
  syncLocalProxySessionPermissions,
} from './p2p-group-agent-proxy.service'
import { findSharedResourceForProjection } from './p2p-shared-resource-id'
import { projectAgentSharedEvent } from './p2p-agent-projection-shared'
import {
  getSharedResourceRepo,
  markImportedAssistantAsGroupMirror,
  readPayloadString,
} from './p2p-agent-projection-utils'

export function applyAgentUpdatedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Agent' || event.eventType !== 'Updated') {
    return
  }

  const sourceAssistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
  const sessionPermissions = parseAgentSessionPermissionsFromPayload(event.payload)
  const sessionTitles = parseAgentSessionTitlesFromPayload(event.payload)
  const sharedRepo = getSharedResourceRepo()
  const existing = findSharedResourceForProjection(
    sharedRepo,
    event.workspaceId,
    sourceAssistantId,
    'Agent',
  )

  if ((sessionPermissions || sessionTitles) && existing) {
    const metadata = readAgentShareMetadata(existing.metadataJson)
    const metadataJson = serializeAgentShareMetadata({
      ...metadata,
      ...(sessionPermissions ? { sessionPermissions } : {}),
      ...(sessionTitles ? { sessionTitles: { ...metadata.sessionTitles, ...sessionTitles } } : {}),
    })
    sharedRepo.update({
      id: existing.id,
      metadataJson,
    })
    if (sessionPermissions) {
      syncLocalProxySessionPermissions({
        resourceId: sourceAssistantId,
        sessionPermissions,
      })
    }
    return
  }

  const packageJson = readPayloadString(event.payload, 'package_json')
  if (!packageJson) {
    return
  }

  const targetWorkspace = getDefaultWorkspace()
  if (!targetWorkspace) {
    return
  }

  if (!existing?.localResourceId) {
    projectAgentSharedEvent({
      ...event,
      eventType: 'Shared',
    })
    return
  }

  const { assistantId } = importAgentPackageToWorkspace(
    targetWorkspace.id,
    packageJson,
    resolveGroupMirrorImportAssistantId(existing.localResourceId),
  )

  markImportedAssistantAsGroupMirror({
    assistantId,
    ownerName: existing.name,
    p2pWorkspaceId: event.workspaceId,
    resourceId: sourceAssistantId,
  })

  if (assistantId !== existing.localResourceId) {
    sharedRepo.update({
      id: existing.id,
      localResourceId: assistantId,
    })
  }
}

export function projectAgentDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Agent' || event.eventType !== 'Deleted') {
    return
  }

  const assistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
  const sharedRepo = getSharedResourceRepo()
  const resource = findSharedResourceForProjection(
    sharedRepo,
    event.workspaceId,
    assistantId,
    'Agent',
  )
  if (resource) {
    const metadata = readAgentShareMetadata(resource.metadataJson)
    const metadataJson = serializeAgentShareMetadata({
      sourceWorkspaceId: metadata.sourceWorkspaceId,
      packageJson: metadata.packageJson,
    })
    sharedRepo.update({ id: resource.id, status: 'unshared', metadataJson })
    cleanupLocalProxySessionsForResource(assistantId)
  }
}
