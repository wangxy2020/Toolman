import type { P2pAgentSessionPermission, P2pSharedResourcePermission } from './types.js'

export const P2P_SHAREABLE_RESOURCE_TYPES = ['Knowledge', 'Note', 'Agent', 'Workflow'] as const
export type P2pShareableProjectionType = (typeof P2P_SHAREABLE_RESOURCE_TYPES)[number]

export type SharedProjectionKind = 'agents' | 'knowledge' | 'notes' | 'workflow'

export type SharedProjectionItem = {
  id: string
  name: string
  kind: SharedProjectionKind
  parentId?: string
  parentName?: string
  addedAt: number
  permission?: P2pSharedResourcePermission
  contentHash?: string
  mimeType?: string
  preview?: string
  sessionPermission?: P2pAgentSessionPermission
  sharedBy?: string
  sourceAssistantId?: string
  referencedModelId?: string
  ownerDeviceId?: string
}

export type ShareProjectionEvent = {
  resourceType: string
  resourceId: string
  eventType: string
  payloadJson: string
  timestamp: number
  operatorId?: string
  sourceDeviceId?: string
}

export type ShareProjection =
  | {
      action: 'upsert'
      item: SharedProjectionItem
      /** When set, drop existing children of this item that are not in the list. */
      pruneChildrenKeepIds?: string[]
      knowledgeBlob?: {
        contentHash: string
        title?: string
        mimeType?: string
        sizeBytes?: number
      }
      noteBody?: {
        noteId: string
        title: string
        content?: string
        loroOplog?: string
        permission?: 'read' | 'write'
      }
    }
  | {
      action: 'remove'
      kind: SharedProjectionKind
      id: string
      /** Also drop children whose `parentId` matches (knowledge base unshare). */
      cascadeChildren: boolean
    }

const KIND_BY_TYPE: Record<P2pShareableProjectionType, SharedProjectionKind> = {
  Knowledge: 'knowledge',
  Note: 'notes',
  Agent: 'agents',
  Workflow: 'workflow',
}

export function isShareableResourceType(resourceType: string): resourceType is P2pShareableProjectionType {
  return (P2P_SHAREABLE_RESOURCE_TYPES as readonly string[]).includes(resourceType)
}

export function resourceTypeToSharedKind(resourceType: string): SharedProjectionKind | null {
  if (!isShareableResourceType(resourceType)) return null
  return KIND_BY_TYPE[resourceType]
}
