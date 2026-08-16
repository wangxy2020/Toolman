export {
  P2P_SHAREABLE_RESOURCE_TYPES,
  isShareableResourceType,
  resourceTypeToSharedKind,
  type P2pShareableProjectionType,
  type SharedProjectionKind,
  type SharedProjectionItem,
  type ShareProjectionEvent,
  type ShareProjection,
} from './share-projection-types.js'

import { isShareableResourceType, type ShareProjection, type ShareProjectionEvent } from './share-projection-types.js'
import { parseSharePayload } from './share-projection-parse.js'
import {
  projectAgent,
  projectKnowledge,
  projectNamedShare,
  projectNote,
} from './share-projection-project.js'

/**
 * Project a workspace WAL event onto the mobile shared-resource mirror.
 * Personal Sync Hub notes/KBs never appear here — only group-authorized events.
 */
export function projectShareableWorkspaceEvent(event: ShareProjectionEvent): ShareProjection[] {
  if (!isShareableResourceType(event.resourceType)) return []
  const payload = parseSharePayload(event.payloadJson)
  if (!payload) return []
  if (event.resourceType === 'Knowledge') return projectKnowledge(event, payload)
  if (event.resourceType === 'Note') return projectNote(event, payload)
  if (event.resourceType === 'Agent') return projectAgent(event, payload)
  return projectNamedShare(event, payload, 'workflow', ['workflow_id'], '共享工作流')
}
