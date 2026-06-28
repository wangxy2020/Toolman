import type { P2pSharedResource } from '@toolman/shared'
import { P2pResourceListInputSchema } from '@toolman/shared'
import {
  assertWorkspaceMemberAccess,
  getWorkspaceMembership,
} from './p2p-permission.guard'
import { getSharedResourceRepo, mapSharedResourceRow } from './knowledge-sync-shared-resource'
import { reconcileP2pSharedResourcesForWorkspace } from './p2p-shared-resource-reconcile.service'

/** 统一读穿投影：事件 → reconcile → p2p_shared_resources → 列表 */
export function listP2pSharedResourcesForWorkspace(
  rawInput: unknown,
): { resources: P2pSharedResource[] } {
  const input = P2pResourceListInputSchema.parse(rawInput)
  const member = getWorkspaceMembership(input.workspaceId)
  if (!member) {
    assertWorkspaceMemberAccess(input.workspaceId)
  }
  if (member?.status !== 'active') {
    return { resources: [] }
  }

  reconcileP2pSharedResourcesForWorkspace(input.workspaceId, input.resourceType)

  const sharedRepo = getSharedResourceRepo()
  const rows = sharedRepo
    .listByWorkspace(input.workspaceId)
    .filter((row) => !input.resourceType || row.resourceType === input.resourceType)
    .filter((row) => (input.status ? row.status === input.status : row.status === 'active'))

  return { resources: rows.map(mapSharedResourceRow) }
}
