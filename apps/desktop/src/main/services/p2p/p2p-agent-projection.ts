import { P2pSharedResourceRepository } from '@toolman/db'
import type { P2pAgentSessionPermission, WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDefaultWorkspace } from '../workspace.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { listWorkspaceEventsSince } from './p2p-event.service'
import {
  importAgentPackageToWorkspace,
  parseAgentSessionPermissionsFromPayload,
  parseAgentSessionTitlesFromPayload,
  readAgentShareMetadata,
  serializeAgentShareMetadata,
} from './agent-share.service'
import {
  getAssistantRowIncludingDeleted,
  isBuiltinAssistantId,
  resolveGroupMirrorImportAssistantId,
  restoreAssistantIfDeleted,
  updateAssistant,
} from '../assistant.service'
import {
  cleanupLocalProxySessionsForResource,
  syncLocalProxySessionPermissions,
} from './p2p-group-agent-proxy.service'

import {
  findSharedResourceForProjection,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import { resolveLocalSharedByMemberId } from './p2p-shared-by-member.service'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

function markImportedAssistantAsGroupMirror(input: {
  assistantId: string
  ownerName: string
  p2pWorkspaceId: string
  resourceId: string
}): void {
  if (isBuiltinAssistantId(input.assistantId)) {
    return
  }

  restoreAssistantIfDeleted(input.assistantId)
  const existing = getAssistantRowIncludingDeleted(input.assistantId)
  if (!existing) return

  const params = JSON.parse(existing.parametersJson) as Record<string, unknown>
  updateAssistant({
    id: input.assistantId,
    name: input.ownerName,
    parameters: {
      ...params,
      p2pGroupSharedMirror: {
        p2pWorkspaceId: input.p2pWorkspaceId,
        resourceId: input.resourceId,
      },
    },
  })
}

function upsertProjectedAgentResource(input: {
  resourceId: string
  event: WorkspaceEvent
  name: string
  metadataJson: string
  localResourceId: string
  existing: ReturnType<P2pSharedResourceRepository['findById']>
}): void {
  const sharedRepo = getSharedResourceRepo()
  const sharedBy = resolveLocalSharedByMemberId(
    input.event.workspaceId,
    input.event.operatorId,
    input.event.sourceDeviceId,
  )
  if (!input.existing) {
    sharedRepo.create({
      id: input.resourceId,
      workspaceId: input.event.workspaceId,
      resourceType: 'Agent',
      localResourceId: input.localResourceId,
      name: input.name,
      sharedBy,
      permission: 'read',
      metadataJson: input.metadataJson,
      createdAt: new Date(input.event.timestamp),
      updatedAt: new Date(input.event.timestamp),
    })
    return
  }

  sharedRepo.update({
    id: input.resourceId,
    name: input.name,
    status: 'active',
    localResourceId: input.localResourceId,
    metadataJson: input.metadataJson,
    ...(input.existing.sharedBy !== sharedBy ? { sharedBy } : {}),
  })
}

function shouldProjectAgentMirrorImport(
  event: WorkspaceEvent,
  existing: ReturnType<P2pSharedResourceRepository['findById']>,
): boolean {
  if (!existing?.localResourceId) {
    return true
  }

  const personalWorkspace = getDefaultWorkspace()
  const sourceWorkspaceId =
    readPayloadString(event.payload, 'source_workspace_id') ??
    readAgentShareMetadata(existing.metadataJson).sourceWorkspaceId
  if (!personalWorkspace || sourceWorkspaceId !== personalWorkspace.id) {
    return true
  }

  return event.sourceDeviceId !== getP2pDeviceInfo().deviceId
}

function upsertAgentSharedListingOnly(input: {
  resourceId: string
  event: WorkspaceEvent
  name: string
  metadataJson: string
  localResourceId: string
  existing: ReturnType<P2pSharedResourceRepository['findById']>
}): void {
  upsertProjectedAgentResource({
    resourceId: input.resourceId,
    event: input.event,
    name: input.name,
    metadataJson: input.metadataJson,
    localResourceId: input.localResourceId,
    existing: input.existing,
  })
}

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

export function reconcileAgentSharedResources(workspaceId: string): void {
  const terminalByAgent = new Map<string, WorkspaceEvent>()
  const packageJsonByAgent = new Map<string, string>()

  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Agent') continue

      const assistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId

      if (event.eventType === 'Updated') {
        const packageJson = readPayloadString(event.payload, 'package_json')
        if (packageJson) {
          packageJsonByAgent.set(assistantId, packageJson)
        }
        continue
      }

      if (
        event.eventType !== 'Shared' &&
        event.eventType !== 'Created' &&
        event.eventType !== 'Deleted'
      ) {
        continue
      }

      terminalByAgent.set(assistantId, event)
    }

    if (batch.length < 200) break
  }

  for (const event of terminalByAgent.values()) {
    if (event.eventType === 'Deleted') {
      projectAgentDeletedEvent(event)
      continue
    }

    const assistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
    const packageJson =
      readPayloadString(event.payload, 'package_json') ?? packageJsonByAgent.get(assistantId)
    projectAgentSharedEvent({
      ...event,
      payload: packageJson ? { ...event.payload, package_json: packageJson } : event.payload,
    })
  }
}

export function resolveAuthoritativeSessionIds(
  existing: string[] | undefined,
  payload: Record<string, unknown>,
): string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(payload, 'session_ids')) {
    return existing
  }
  if (!Array.isArray(payload.session_ids)) {
    return undefined
  }
  const next = [
    ...new Set(
      payload.session_ids.filter((item): item is string => typeof item === 'string'),
    ),
  ]
  return next.length > 0 ? next : undefined
}

function resolveProjectedSessionTitles(
  existing: Record<string, string> | undefined,
  incoming: Record<string, string> | undefined,
  sessionIds: string[] | undefined,
  payloadHasSessionIds: boolean,
): Record<string, string> | undefined {
  if (!payloadHasSessionIds) {
    return mergeSessionTitleMaps(existing, incoming)
  }
  const merged = { ...(existing ?? {}), ...(incoming ?? {}) }
  if (!sessionIds || sessionIds.length === 0) {
    return undefined
  }
  const allowed = new Set(sessionIds)
  const pruned = Object.fromEntries(
    Object.entries(merged).filter(([sessionId]) => allowed.has(sessionId)),
  )
  return Object.keys(pruned).length > 0 ? pruned : undefined
}

function resolveProjectedSessionPermissions(
  existing: Record<string, P2pAgentSessionPermission> | undefined,
  incoming: Record<string, P2pAgentSessionPermission> | undefined,
  sessionIds: string[] | undefined,
  payloadHasSessionIds: boolean,
): Record<string, P2pAgentSessionPermission> | undefined {
  if (!payloadHasSessionIds) {
    return incoming ?? existing
  }
  const merged = { ...(existing ?? {}), ...(incoming ?? {}) }
  if (!sessionIds || sessionIds.length === 0) {
    return undefined
  }
  const allowed = new Set(sessionIds)
  const pruned = Object.fromEntries(
    Object.entries(merged).filter(([sessionId]) => allowed.has(sessionId)),
  )
  return Object.keys(pruned).length > 0 ? pruned : undefined
}

function mergeSessionTitleMaps(
  existing: Record<string, string> | undefined,
  incoming: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged = { ...(existing ?? {}), ...(incoming ?? {}) }
  return Object.keys(merged).length > 0 ? merged : undefined
}
