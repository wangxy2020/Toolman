import type { P2pResourceType, WorkspaceEvent } from '@toolman/shared'
import {
  assertWorkspaceMembershipAccess,
} from './p2p-permission.guard'
import { getEventRepo, mapEventRow } from './p2p-event-store-internal'

const ACTIVITY_LOG_EXCLUDED_RESOURCE_TYPES = new Set(['GroupChat'])

export function listP2pEvents(rawInput: {
  workspaceId: string
  resourceType?: P2pResourceType
  resourceId?: string
  sinceSeq?: number
  limit?: number
  offset?: number
}): { events: WorkspaceEvent[]; total: number; hasMore: boolean } {
  assertWorkspaceMembershipAccess(rawInput.workspaceId)

  const limit = Math.min(rawInput.limit ?? 50, 200)
  const offset = rawInput.offset ?? 0
  const repo = getEventRepo()
  const total = repo.count({
    workspaceId: rawInput.workspaceId,
    resourceType: rawInput.resourceType,
    resourceId: rawInput.resourceId,
    sinceSeq: rawInput.sinceSeq,
  })
  const rows = repo
    .list({
      workspaceId: rawInput.workspaceId,
      resourceType: rawInput.resourceType,
      resourceId: rawInput.resourceId,
      sinceSeq: rawInput.sinceSeq,
      limit: Math.min(limit * 3, 200),
      offset,
      order: 'desc',
    })
    .filter((row) => !ACTIVITY_LOG_EXCLUDED_RESOURCE_TYPES.has(row.resourceType))
    .slice(0, limit)

  return {
    events: rows.map(mapEventRow),
    total: rows.length < limit ? offset + rows.length : total,
    hasMore: offset + rows.length < total,
  }
}

export function getP2pEvent(eventId: string): WorkspaceEvent {
  const row = getEventRepo().findById(eventId)
  if (!row) {
    throw new Error('事件不存在')
  }
  assertWorkspaceMembershipAccess(row.workspaceId)
  return mapEventRow(row)
}

export function getWorkspaceLatestSeq(workspaceId: string): number {
  assertWorkspaceMembershipAccess(workspaceId)
  return getEventRepo().getLatestSeq(workspaceId)
}

export function listWorkspaceEventsSince(
  workspaceId: string,
  sinceSeq: number,
  limit = 200,
): WorkspaceEvent[] {
  assertWorkspaceMembershipAccess(workspaceId)
  const rows = getEventRepo().list({
    workspaceId,
    sinceSeq,
    limit,
    order: 'asc',
  })
  return rows.map(mapEventRow)
}

export function markP2pEventSynced(eventId: string): void {
  getEventRepo().markSynced(eventId)
}
