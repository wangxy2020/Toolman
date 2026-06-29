import type { WorkspaceEvent } from '@toolman/shared'
import { findSharedResourceForProjection } from './p2p-shared-resource-id'
import { getSharedResourceRepo, readPayloadString } from './p2p-knowledge-projection-utils'

export function projectKnowledgeDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Knowledge' || event.eventType !== 'Deleted') {
    return
  }

  const kbId = readPayloadString(event.payload, 'kb_id') ?? event.resourceId
  const sharedRepo = getSharedResourceRepo()
  const resource = findSharedResourceForProjection(sharedRepo, event.workspaceId, kbId, 'Knowledge')
  if (resource) {
    sharedRepo.update({ id: resource.id, status: 'unshared' })
  }
}
