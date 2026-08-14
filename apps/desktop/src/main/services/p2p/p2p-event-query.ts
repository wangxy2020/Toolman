import type { P2pResourceType, WorkspaceEvent } from '@toolman/shared'
import {
  assertWorkspaceMembershipAccess,
} from './p2p-permission.guard'
import { getEventRepo, mapEventRow } from './p2p-event-store-internal'

const ACTIVITY_LOG_EXCLUDED_RESOURCE_TYPES = ['GroupChat'] as const satisfies readonly P2pResourceType[]

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
  const excludeResourceTypes = rawInput.resourceType
    ? undefined
    : [...ACTIVITY_LOG_EXCLUDED_RESOURCE_TYPES]
  const filter = {
    workspaceId: rawInput.workspaceId,
    resourceType: rawInput.resourceType,
    excludeResourceTypes,
    resourceId: rawInput.resourceId,
    sinceSeq: rawInput.sinceSeq,
  }
  const total = repo.count(filter)
  const rows = repo.list({
    ...filter,
    limit,
    offset,
    order: 'desc',
  })

  return {
    events: rows.map(mapEventRow),
    total,
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

export const WORKSPACE_EVENT_PAGE_SIZE = 200

/** Page through workspace events; stops if the seq cursor does not advance. */
export function iterateWorkspaceEventPages(
  workspaceId: string,
  onPage: (events: WorkspaceEvent[]) => void,
): void {
  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, WORKSPACE_EVENT_PAGE_SIZE)
    if (batch.length === 0) break
    const lastSeq = batch.at(-1)?.seq
    if (lastSeq == null || lastSeq <= sinceSeq) break
    onPage(batch)
    sinceSeq = lastSeq
    if (batch.length < WORKSPACE_EVENT_PAGE_SIZE) break
  }
}

export function markP2pEventSynced(eventId: string): void {
  getEventRepo().markSynced(eventId)
}
