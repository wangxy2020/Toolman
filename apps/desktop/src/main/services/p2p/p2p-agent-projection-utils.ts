import { P2pSharedResourceRepository } from '@toolman/db'
import type { P2pAgentSessionPermission, WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDefaultWorkspace } from '../workspace.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import {
  readAgentShareMetadata,
} from './agent-share.service'
import {
  getAssistantRowIncludingDeleted,
  isBuiltinAssistantId,
  restoreAssistantIfDeleted,
  updateAssistant,
} from '../assistant.service'
import { resolveLocalSharedByMemberId } from './p2p-shared-by-member.service'

export function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

export function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

export function markImportedAssistantAsGroupMirror(input: {
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

export function upsertProjectedAgentResource(input: {
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

export function shouldProjectAgentMirrorImport(
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

export function upsertAgentSharedListingOnly(input: {
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

function mergeSessionTitleMaps(
  existing: Record<string, string> | undefined,
  incoming: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged = { ...(existing ?? {}), ...(incoming ?? {}) }
  return Object.keys(merged).length > 0 ? merged : undefined
}

export function resolveProjectedSessionTitles(
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

export function resolveProjectedSessionPermissions(
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
