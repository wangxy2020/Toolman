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
  restoreAssistantIfDeleted,
  updateAssistant,
} from '../assistant.service'
import {
  cleanupLocalProxySessionsForResource,
  syncLocalProxySessionPermissions,
} from './p2p-group-agent-proxy.service'

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
  sourceAssistantId: string
  event: WorkspaceEvent
  name: string
  metadataJson: string
  localResourceId: string
  existing: ReturnType<P2pSharedResourceRepository['findById']>
}): void {
  const sharedRepo = getSharedResourceRepo()
  if (!input.existing) {
    sharedRepo.create({
      id: input.sourceAssistantId,
      workspaceId: input.event.workspaceId,
      resourceType: 'Agent',
      localResourceId: input.localResourceId,
      name: input.name,
      sharedBy: input.event.operatorId,
      permission: 'read',
      metadataJson: input.metadataJson,
      createdAt: new Date(input.event.timestamp),
      updatedAt: new Date(input.event.timestamp),
    })
    return
  }

  sharedRepo.update({
    id: input.sourceAssistantId,
    name: input.name,
    status: 'active',
    localResourceId: input.localResourceId,
    metadataJson: input.metadataJson,
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

export function projectAgentSharedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Agent') {
    return
  }
  if (event.eventType !== 'Shared' && event.eventType !== 'Created') {
    return
  }

  const sourceAssistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
  const name = readPayloadString(event.payload, 'name') ?? '共享智能体'
  const packageJson = readPayloadString(event.payload, 'package_json')
  const sourceWorkspaceId = readPayloadString(event.payload, 'source_workspace_id')

  if (!packageJson) {
    return
  }

  const targetWorkspace = getDefaultWorkspace()
  if (!targetWorkspace) {
    return
  }

  const sharedRepo = getSharedResourceRepo()
  const existing = sharedRepo.findById(sourceAssistantId)

  const payloadHasSessionIds = Object.prototype.hasOwnProperty.call(event.payload, 'session_ids')
  const sessionIds = resolveAuthoritativeSessionIds(
    existing ? readAgentShareMetadata(existing.metadataJson).sessionIds : undefined,
    event.payload,
  )
  const sessionPermissions = parseAgentSessionPermissionsFromPayload(event.payload)
  const sessionTitles = parseAgentSessionTitlesFromPayload(event.payload)
  const existingMetadata = existing ? readAgentShareMetadata(existing.metadataJson) : {}
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

  if (payloadHasSessionIds) {
    cleanupLocalProxySessionsForResource(
      sourceAssistantId,
      sessionIds ? new Set(sessionIds) : undefined,
    )
  }

  const projectMirrorImport = shouldProjectAgentMirrorImport(event, existing)

  if (!projectMirrorImport) {
    if (existing) {
      upsertProjectedAgentResource({
        sourceAssistantId,
        event,
        name,
        metadataJson,
        localResourceId: existing.localResourceId!,
        existing,
      })
    }
    return
  }

  if (
    existing?.status === 'active' &&
    existing.workspaceId === event.workspaceId &&
    existingMetadata.packageJson === packageJson &&
    existing.localResourceId &&
    getAssistantRowIncludingDeleted(existing.localResourceId)
  ) {
    markImportedAssistantAsGroupMirror({
      assistantId: existing.localResourceId,
      ownerName: name,
      p2pWorkspaceId: event.workspaceId,
      resourceId: sourceAssistantId,
    })
    upsertProjectedAgentResource({
      sourceAssistantId,
      event,
      name,
      metadataJson,
      localResourceId: existing.localResourceId,
      existing,
    })
    return
  }

  const { assistantId } = importAgentPackageToWorkspace(
    targetWorkspace.id,
    packageJson,
    existing?.localResourceId ?? undefined,
  )

  markImportedAssistantAsGroupMirror({
    assistantId,
    ownerName: name,
    p2pWorkspaceId: event.workspaceId,
    resourceId: sourceAssistantId,
  })

  upsertProjectedAgentResource({
    sourceAssistantId,
    event,
    name,
    metadataJson,
    localResourceId: assistantId,
    existing,
  })
}

export function applyAgentUpdatedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Agent' || event.eventType !== 'Updated') {
    return
  }

  const sourceAssistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
  const sessionPermissions = parseAgentSessionPermissionsFromPayload(event.payload)
  const sessionTitles = parseAgentSessionTitlesFromPayload(event.payload)
  const sharedRepo = getSharedResourceRepo()
  const existing = sharedRepo.findById(sourceAssistantId)

  if ((sessionPermissions || sessionTitles) && existing) {
    const metadata = readAgentShareMetadata(existing.metadataJson)
    const metadataJson = serializeAgentShareMetadata({
      ...metadata,
      ...(sessionPermissions ? { sessionPermissions } : {}),
      ...(sessionTitles ? { sessionTitles: { ...metadata.sessionTitles, ...sessionTitles } } : {}),
    })
    sharedRepo.update({
      id: sourceAssistantId,
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
    existing.localResourceId,
  )

  markImportedAssistantAsGroupMirror({
    assistantId,
    ownerName: existing.name,
    p2pWorkspaceId: event.workspaceId,
    resourceId: sourceAssistantId,
  })

  if (assistantId !== existing.localResourceId) {
    sharedRepo.update({
      id: sourceAssistantId,
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
  const resource = sharedRepo.findById(assistantId)
  if (resource) {
    const metadata = readAgentShareMetadata(resource.metadataJson)
    const metadataJson = serializeAgentShareMetadata({
      sourceWorkspaceId: metadata.sourceWorkspaceId,
      packageJson: metadata.packageJson,
    })
    sharedRepo.update({ id: assistantId, status: 'unshared', metadataJson })
    cleanupLocalProxySessionsForResource(assistantId)
  }
}

export function reconcileAgentSharedResources(workspaceId: string): void {
  const terminalByAgent = new Map<string, WorkspaceEvent>()

  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Agent') continue
      if (
        event.eventType !== 'Shared' &&
        event.eventType !== 'Created' &&
        event.eventType !== 'Deleted'
      ) {
        continue
      }

      const assistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
      terminalByAgent.set(assistantId, event)
    }

    if (batch.length < 200) break
  }

  for (const event of terminalByAgent.values()) {
    if (event.eventType === 'Deleted') {
      projectAgentDeletedEvent(event)
      continue
    }
    projectAgentSharedEvent(event)
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
