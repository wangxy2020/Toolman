import type { P2pMailboxSharedAgent } from '@toolman/shared'
import { emitMeshEvent } from './meshEvents'

export function applyAgentShareListings(
  workspaceId: string,
  listings: P2pMailboxSharedAgent[] | undefined,
): void {
  if (!listings || listings.length === 0) return
  for (const listing of listings) {
    emitMeshEvent({
      type: 'shared',
      workspaceId,
      item: {
        id: listing.id,
        name: listing.name,
        kind: 'agents',
        addedAt: Date.now(),
        sharedBy: listing.sharedBy,
        sourceAssistantId: listing.id,
        referencedModelId: listing.referencedModelId,
        ownerDeviceId: listing.ownerDeviceId,
      },
    })
    for (const sessionId of listing.sessionIds) {
      emitMeshEvent({
        type: 'shared',
        workspaceId,
        item: {
          id: sessionId,
          name: listing.sessionTitles?.[sessionId]?.trim() || '未命名话题',
          kind: 'agents',
          parentId: listing.id,
          parentName: listing.name,
          addedAt: Date.now(),
          sessionPermission: listing.sessionPermissions?.[sessionId] ?? 'read',
          sharedBy: listing.sharedBy,
          sourceAssistantId: listing.id,
          referencedModelId: listing.referencedModelId,
          ownerDeviceId: listing.ownerDeviceId,
        },
      })
    }
    if (listing.sessionIds.length > 0) {
      emitMeshEvent({
        type: 'shared-prune-children',
        workspaceId,
        kind: 'agents',
        parentId: listing.id,
        keepIds: listing.sessionIds,
      })
    }
  }
}
