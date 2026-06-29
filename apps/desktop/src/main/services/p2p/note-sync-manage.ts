import type { P2pSharedResource, WorkspaceEvent } from '@toolman/shared'
import {
  P2pNoteSetPermissionInputSchema,
  P2pResourceUnshareInputSchema,
} from '@toolman/shared'
import { appendP2pEvent } from './p2p-event.service'
import { listP2pSharedResourcesForWorkspace } from './p2p-shared-resource-list.service'
import {
  assertCanManageSharedResource,
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'
import { getSharedResourceRepo, mapSharedResourceRow } from './note-sync-utils'

export async function setP2pNotePermission(rawInput: unknown): Promise<{
  sharedResource: P2pSharedResource
  event: WorkspaceEvent
}> {
  const input = P2pNoteSetPermissionInputSchema.parse(rawInput)
  const member = assertWorkspaceMemberAccess(input.workspaceId)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId || resource.resourceType !== 'Note') {
    throw new Error('共享资源不存在')
  }
  if (resource.status !== 'active') {
    throw new Error('共享资源不存在')
  }

  assertCanManageSharedResource(input.workspaceId, resource.sharedBy)

  const updated =
    sharedRepo.update({
      id: resource.id,
      permission: input.permission,
    }) ?? resource

  const noteId = resource.localResourceId ?? resource.id
  const event = await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Note',
    resourceId: noteId,
    operatorId: member.id,
    eventType: 'Updated',
    payload: {
      note_id: noteId,
      permission: input.permission,
    },
  })

  return { sharedResource: mapSharedResourceRow(updated), event }
}

export async function unshareP2pNote(rawInput: unknown): Promise<{ unshared: true }> {
  const input = P2pResourceUnshareInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Note') {
    throw new Error('只能取消共享笔记资源')
  }
  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)

  sharedRepo.update({ id: resource.id, status: 'unshared' })

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Note',
    resourceId: resource.localResourceId ?? resource.id,
    operatorId: member.id,
    eventType: 'Deleted',
    payload: {
      note_id: resource.localResourceId ?? resource.id,
    },
  })

  return { unshared: true }
}

export function listP2pSharedNotes(rawInput: unknown): { resources: P2pSharedResource[] } {
  return listP2pSharedResourcesForWorkspace(rawInput)
}

export function listP2pNoteShareTargets(noteId: string): { workspaceIds: string[] } {
  const rows = getSharedResourceRepo().listActiveByLocalResource(noteId, 'Note')
  return { workspaceIds: rows.map((row) => row.workspaceId) }
}
