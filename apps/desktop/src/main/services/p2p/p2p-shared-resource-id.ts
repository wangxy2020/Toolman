import { randomUUID } from 'node:crypto'
import type { P2pSharedResourceRepository, P2pSharedResourceRow } from '@toolman/db'

export function findSharedResourceInWorkspace(
  repo: P2pSharedResourceRepository,
  workspaceId: string,
  localResourceId: string,
  resourceType: P2pSharedResourceRow['resourceType'],
): P2pSharedResourceRow | null {
  return repo.findByWorkspaceAndLocalResource(workspaceId, localResourceId, resourceType)
}

/** Prefer stable ids (e.g. local kb id) but allocate a new id when already used by another group. */
export function resolveSharedResourceId(
  repo: P2pSharedResourceRepository,
  preferredId: string,
  workspaceId: string,
): string {
  const existing = repo.findById(preferredId)
  if (!existing || existing.workspaceId === workspaceId) {
    return preferredId
  }
  return randomUUID()
}
