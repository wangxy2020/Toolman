import { P2pSharedResourceRepository } from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDefaultWorkspace } from '../workspace.service'
import {
  importAgentPackageToWorkspace,
  parseAgentSessionPermissionsFromPayload,
  readAgentShareMetadata,
  serializeAgentShareMetadata,
} from './agent-share.service'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
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

  const sessionIds = event.payload.session_ids
  const sessionPermissions = parseAgentSessionPermissionsFromPayload(event.payload)
  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson,
    ...(Array.isArray(sessionIds) && sessionIds.length > 0
      ? {
          sessionIds: sessionIds.filter((item): item is string => typeof item === 'string'),
        }
      : {}),
    ...(sessionPermissions ? { sessionPermissions } : {}),
  })

  if (
    existing?.status === 'active' &&
    existing.workspaceId === event.workspaceId &&
    existing.localResourceId
  ) {
    try {
      const existingMetadata = readAgentShareMetadata(existing.metadataJson)
      if (existingMetadata.packageJson === packageJson) {
        sharedRepo.update({
          id: sourceAssistantId,
          name,
          metadataJson,
        })
        return
      }
    } catch {
      // continue with projection
    }
  }

  const localAssistantId = existing?.localResourceId ?? undefined

  const { assistantId } = importAgentPackageToWorkspace(
    targetWorkspace.id,
    packageJson,
    localAssistantId,
  )

  if (!existing) {
    sharedRepo.create({
      id: sourceAssistantId,
      workspaceId: event.workspaceId,
      resourceType: 'Agent',
      localResourceId: assistantId,
      name,
      sharedBy: event.operatorId,
      permission: 'read',
      metadataJson,
      createdAt: new Date(event.timestamp),
      updatedAt: new Date(event.timestamp),
    })
  } else {
    sharedRepo.update({
      id: sourceAssistantId,
      name,
      status: 'active',
      metadataJson,
    })
  }
}

export function applyAgentUpdatedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Agent' || event.eventType !== 'Updated') {
    return
  }

  const sourceAssistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
  const sessionPermissions = parseAgentSessionPermissionsFromPayload(event.payload)
  const sharedRepo = getSharedResourceRepo()
  const existing = sharedRepo.findById(sourceAssistantId)

  if (sessionPermissions && existing) {
    const metadata = readAgentShareMetadata(existing.metadataJson)
    const metadataJson = serializeAgentShareMetadata({
      ...metadata,
      sessionPermissions,
    })
    sharedRepo.update({
      id: sourceAssistantId,
      metadataJson,
    })
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

  importAgentPackageToWorkspace(
    targetWorkspace.id,
    packageJson,
    existing.localResourceId,
  )
}

export function projectAgentDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Agent' || event.eventType !== 'Deleted') {
    return
  }

  const assistantId = readPayloadString(event.payload, 'assistant_id') ?? event.resourceId
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(assistantId)
  if (resource) {
    sharedRepo.update({ id: assistantId, status: 'unshared' })
  }
}
