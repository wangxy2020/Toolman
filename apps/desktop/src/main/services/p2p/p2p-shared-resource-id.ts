import { randomUUID } from 'node:crypto'
import { assistants, type P2pSharedResourceRepository, type P2pSharedResourceRow } from '@toolman/db'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../bootstrap/database'

function readMirrorSourceResourceId(localAssistantId: string): string | null {
  const db = getDatabase()
  const row = db.select().from(assistants).where(eq(assistants.id, localAssistantId)).get()
  if (!row) return null
  try {
    const params = JSON.parse(row.parametersJson) as Record<string, unknown>
    const mirror = params.p2pGroupSharedMirror as { resourceId?: string } | undefined
    return typeof mirror?.resourceId === 'string' && mirror.resourceId.trim()
      ? mirror.resourceId.trim()
      : null
  } catch {
    return null
  }
}

export function findSharedResourceInWorkspace(
  repo: P2pSharedResourceRepository,
  workspaceId: string,
  localResourceId: string,
  resourceType: P2pSharedResourceRow['resourceType'],
): P2pSharedResourceRow | null {
  return repo.findByWorkspaceAndLocalResource(workspaceId, localResourceId, resourceType)
}

/** Workspace-scoped lookup for event projection (preferred over global findById). */
export function findSharedResourceForProjection(
  repo: P2pSharedResourceRepository,
  workspaceId: string,
  localResourceId: string,
  resourceType: P2pSharedResourceRow['resourceType'],
): P2pSharedResourceRow | null {
  const byWorkspace = repo.findByWorkspaceAndLocalResource(
    workspaceId,
    localResourceId,
    resourceType,
  )
  if (byWorkspace) return byWorkspace

  const byId = repo.findById(localResourceId)
  if (byId?.workspaceId === workspaceId && byId.resourceType === resourceType) {
    return byId
  }
  return null
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

/** Cross-device stable id for agent relay (owner's source assistant id). */
export function resolveAgentRelayResourceId(
  repo: P2pSharedResourceRepository,
  workspaceId: string,
  resourceId: string,
  sourceAssistantId?: string,
): string {
  const normalizedSource = sourceAssistantId?.trim()
  if (normalizedSource) {
    return normalizedSource
  }

  const resource = findSharedResourceForProjection(repo, workspaceId, resourceId, 'Agent')
  if (resource?.localResourceId?.trim()) {
    const mirrorSource = readMirrorSourceResourceId(resource.localResourceId)
    if (mirrorSource) {
      return mirrorSource
    }
    return resource.localResourceId
  }
  if (resource) {
    return resource.id
  }
  return resourceId
}

export function findAgentSharedResourceInWorkspace(
  repo: P2pSharedResourceRepository,
  workspaceId: string,
  resourceId: string,
  sourceAssistantId?: string,
): P2pSharedResourceRow | null {
  const relayResourceId = resolveAgentRelayResourceId(
    repo,
    workspaceId,
    resourceId,
    sourceAssistantId,
  )
  return (
    findSharedResourceForProjection(repo, workspaceId, relayResourceId, 'Agent') ??
    repo.findByWorkspaceAndLocalResource(workspaceId, relayResourceId, 'Agent')
  )
}
