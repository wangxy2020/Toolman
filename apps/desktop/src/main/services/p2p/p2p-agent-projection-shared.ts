import type { WorkspaceEvent } from '@toolman/shared'
import { getDefaultWorkspace } from '../workspace.service'
import {
  importAgentPackageToWorkspace,
  parseAgentSessionPermissionsFromPayload,
  parseAgentSessionTitlesFromPayload,
  readAgentShareMetadata,
  serializeAgentShareMetadata,
} from './agent-share.service'
import {
  getAssistantRowIncludingDeleted,
  resolveGroupMirrorImportAssistantId,
} from '../assistant.service'
import { cleanupLocalProxySessionsForResource } from './p2p-group-agent-proxy.service'
import {
  findSharedResourceForProjection,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import { resolveAuthoritativeSessionIds } from './p2p-agent-projection-reconcile'
import {
  getSharedResourceRepo,
  markImportedAssistantAsGroupMirror,
  readPayloadString,
  resolveProjectedSessionPermissions,
  resolveProjectedSessionTitles,
  shouldProjectAgentMirrorImport,
  upsertAgentSharedListingOnly,
  upsertProjectedAgentResource,
} from './p2p-agent-projection-utils'

export function projectAgentSharedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Agent') {
    return
  }
  if (event.eventType !== 'Shared' && event.eventType !== 'Created') {
    return
  }

  const sourceAssistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
  const name = readPayloadString(event.payload, 'name') ?? '共享智能体'
  let packageJson = readPayloadString(event.payload, 'package_json')
  const sourceWorkspaceId = readPayloadString(event.payload, 'source_workspace_id')

  const sharedRepo = getSharedResourceRepo()
  const existing = findSharedResourceForProjection(
    sharedRepo,
    event.workspaceId,
    sourceAssistantId,
    'Agent',
  )
  const preferredRowId = event.resourceId || sourceAssistantId
  const resourceId =
    existing?.id ?? resolveSharedResourceId(sharedRepo, preferredRowId, event.workspaceId)

  const existingMetadata = existing ? readAgentShareMetadata(existing.metadataJson) : {}
  if (!packageJson) {
    packageJson = existingMetadata.packageJson
  }

  const payloadHasSessionIds = Object.prototype.hasOwnProperty.call(event.payload, 'session_ids')
  const sessionIds = resolveAuthoritativeSessionIds(
    existingMetadata.sessionIds,
    event.payload,
  )
  const sessionPermissions = parseAgentSessionPermissionsFromPayload(event.payload)
  const sessionTitles = parseAgentSessionTitlesFromPayload(event.payload)
  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson,
    sessionIds,
    sessionTitles: resolveProjectedSessionTitles(
      existingMetadata.sessionTitles,
      sessionTitles,
      sessionIds,
      payloadHasSessionIds,
    ),
    sessionPermissions: resolveProjectedSessionPermissions(
      existingMetadata.sessionPermissions,
      sessionPermissions,
      sessionIds,
      payloadHasSessionIds,
    ),
  })

  const listingLocalResourceId = existing?.localResourceId ?? sourceAssistantId
  upsertAgentSharedListingOnly({
    resourceId,
    event,
    name,
    metadataJson,
    localResourceId: listingLocalResourceId,
    existing,
  })

  if (!packageJson) {
    return
  }

  const targetWorkspace = getDefaultWorkspace()
  if (!targetWorkspace) {
    return
  }

  if (payloadHasSessionIds) {
    cleanupLocalProxySessionsForResource(
      sourceAssistantId,
      sessionIds ? new Set(sessionIds) : undefined,
    )
  }

  const projected = sharedRepo.findById(resourceId)
  const projectMirrorImport = shouldProjectAgentMirrorImport(event, projected)

  if (!projectMirrorImport) {
    return
  }

  const projectedMetadata = readAgentShareMetadata(projected?.metadataJson)
  if (
    projected?.status === 'active' &&
    projected.workspaceId === event.workspaceId &&
    projectedMetadata.packageJson === packageJson &&
    projected.localResourceId &&
    getAssistantRowIncludingDeleted(projected.localResourceId) &&
    !getAssistantRowIncludingDeleted(projected.localResourceId)?.deletedAt
  ) {
    markImportedAssistantAsGroupMirror({
      assistantId: projected.localResourceId,
      ownerName: name,
      p2pWorkspaceId: event.workspaceId,
      resourceId: sourceAssistantId,
    })
    return
  }

  try {
    const { assistantId } = importAgentPackageToWorkspace(
      targetWorkspace.id,
      packageJson,
      resolveGroupMirrorImportAssistantId(projected?.localResourceId ?? undefined),
    )

    markImportedAssistantAsGroupMirror({
      assistantId,
      ownerName: name,
      p2pWorkspaceId: event.workspaceId,
      resourceId: sourceAssistantId,
    })

    upsertProjectedAgentResource({
      resourceId,
      event,
      name,
      metadataJson,
      localResourceId: assistantId,
      existing: projected,
    })
  } catch {
    // Keep listing-only projection when mirror import fails.
  }
}
