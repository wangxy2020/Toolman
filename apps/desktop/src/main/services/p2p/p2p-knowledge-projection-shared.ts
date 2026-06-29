import { logStructured } from '../structured-log.service'
import type { WorkspaceEvent } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { listWorkspaceEventsSince } from './p2p-event.service'
import { parseKnowledgeDocumentPermissionsFromPayload } from './p2p-knowledge-share-metadata'
import { stripGroupPrefixedName } from './p2p-group-resource-naming'
import { getActiveWorkspaceMember } from './p2p-permission.guard'
import { resolveLocalSharedByMemberId } from './p2p-shared-by-member.service'
import { findSharedResourceForProjection, resolveSharedResourceId } from './p2p-shared-resource-id'
import {
  getSharedResourceRepo,
  protectOwnerSourceKnowledgeBase,
  readPayloadString,
} from './p2p-knowledge-projection-utils'
import { projectKnowledgeDeletedEvent } from './p2p-knowledge-projection-deleted'

export function reconcileKnowledgeSharedResources(workspaceId: string): void {
  const terminalByKb = new Map<string, WorkspaceEvent>()

  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Knowledge') continue
      if (
        event.eventType !== 'Shared' &&
        event.eventType !== 'Created' &&
        event.eventType !== 'Deleted'
      ) {
        continue
      }

      const kbId = readPayloadString(event.payload, 'kb_id') ?? event.resourceId
      terminalByKb.set(kbId, event)
    }

    if (batch.length < 200) break
  }

  for (const event of terminalByKb.values()) {
    try {
      if (event.eventType === 'Deleted') {
        projectKnowledgeDeletedEvent(event)
        continue
      }
      projectKnowledgeSharedEvent(event)
    } catch (error) {
      logStructured(
        'p2p',
        'warn',
        `reconcile knowledge ${event.resourceId}: ${toErrorMessage(error, String(error))}`,
      )
    }
  }
}

export function projectKnowledgeSharedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Knowledge') {
    return
  }
  if (event.eventType !== 'Shared' && event.eventType !== 'Created') {
    return
  }

  const kbId = readPayloadString(event.payload, 'kb_id') ?? event.resourceId
  const name = stripGroupPrefixedName(
    event.workspaceId,
    readPayloadString(event.payload, 'name') ?? '共享知识库',
  )
  const description = readPayloadString(event.payload, 'description') ?? null
  const sourceWorkspaceId = readPayloadString(event.payload, 'source_workspace_id')
  const documentIdsRaw = event.payload.document_ids
  const documentIds = Array.isArray(documentIdsRaw)
    ? documentIdsRaw.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : undefined
  const documentPermissions = parseKnowledgeDocumentPermissionsFromPayload(event.payload)

  const sharedRepo = getSharedResourceRepo()
  const existing = findSharedResourceForProjection(sharedRepo, event.workspaceId, kbId, 'Knowledge')
  const existingMetadata = existing?.metadataJson
    ? (() => {
        try {
          return JSON.parse(existing.metadataJson) as {
            documentPermissions?: Record<string, string>
          }
        } catch {
          return {}
        }
      })()
    : {}

  const metadataJson = JSON.stringify({
    description,
    ...(sourceWorkspaceId ? { sourceWorkspaceId } : {}),
    ...(documentIds && documentIds.length > 0 ? { documentIds } : {}),
    ...(documentPermissions || existingMetadata.documentPermissions
      ? {
          documentPermissions: {
            ...(existingMetadata.documentPermissions ?? {}),
            ...(documentPermissions ?? {}),
          },
        }
      : {}),
  })

  const resourceId =
    existing?.id ?? resolveSharedResourceId(sharedRepo, kbId, event.workspaceId)
  const sharedBy = resolveLocalSharedByMemberId(
    event.workspaceId,
    event.operatorId,
    event.sourceDeviceId,
  )
  if (!existing) {
    sharedRepo.create({
      id: resourceId,
      workspaceId: event.workspaceId,
      resourceType: 'Knowledge',
      localResourceId: kbId,
      name,
      sharedBy,
      permission: 'read',
      metadataJson,
      createdAt: new Date(event.timestamp),
      updatedAt: new Date(event.timestamp),
    })
  } else if (
    existing.name !== name ||
    existing.metadataJson !== metadataJson ||
    existing.status !== 'active' ||
    existing.sharedBy !== sharedBy
  ) {
    sharedRepo.update({
      id: resourceId,
      name,
      metadataJson,
      status: 'active',
      sharedBy,
    })
  }

  try {
    const localMember = getActiveWorkspaceMember(event.workspaceId)
    if (event.operatorId === localMember.id && sourceWorkspaceId) {
      protectOwnerSourceKnowledgeBase(event.workspaceId, kbId, sourceWorkspaceId, name)
    }
  } catch {
    // viewer is not a member of this workspace yet
  }
}
