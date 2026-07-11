import {
  PM_PENDING_AGENT_REVISION_KEY,
  readPendingAgentScheduleRevision,
} from '@toolman/shared'

/**
 * Session-scoped pending flags so Save can bump even if project list metadata is stale.
 * Durable source of truth is project metadata `pendingAgentScheduleRevision` (DB).
 * Session is optimistic only until getProject / list refresh catches up.
 */
function storageKey(workspaceId: string): string {
  return `tm-pm-pending-agent-revision:${workspaceId}`
}

function readMap(workspaceId: string): Record<string, true> {
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const next: Record<string, true> = {}
    for (const [projectId, value] of Object.entries(parsed)) {
      if (value === true) next[projectId] = true
    }
    return next
  } catch {
    return {}
  }
}

function writeMap(workspaceId: string, map: Record<string, true>): void {
  try {
    sessionStorage.setItem(storageKey(workspaceId), JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function markSessionPendingAgentRevision(workspaceId: string, projectId: string): void {
  const map = readMap(workspaceId)
  map[projectId] = true
  writeMap(workspaceId, map)
}

export function clearSessionPendingAgentRevision(workspaceId: string, projectId: string): void {
  const map = readMap(workspaceId)
  if (!(projectId in map)) return
  delete map[projectId]
  writeMap(workspaceId, map)
}

export function hasSessionPendingAgentRevision(workspaceId: string, projectId: string): boolean {
  return readMap(workspaceId)[projectId] === true
}

/** Patch used with updateProject shallow-merge after agent apply. */
export function pendingAgentRevisionMetadataPatch(): Record<string, unknown> {
  return { [PM_PENDING_AGENT_REVISION_KEY]: true }
}

/** Prefer DB metadata; fall back to session only while list/getProject catches up. */
export function isPendingAgentScheduleRevision(
  metadata: Record<string, unknown> | null | undefined,
  workspaceId: string,
  projectId: string,
): boolean {
  if (readPendingAgentScheduleRevision(metadata)) return true
  return hasSessionPendingAgentRevision(workspaceId, projectId)
}
