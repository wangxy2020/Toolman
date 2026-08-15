import type { WorkspaceEvent } from '@toolman/shared'
import { mockFn } from '../../test-utils/mock-fn'

type P2pEventServiceModule = typeof import('./p2p-event.service')

/** Keep in sync with `WORKSPACE_EVENT_PAGE_SIZE` in p2p-event-query.ts. */
const WORKSPACE_EVENT_PAGE_SIZE = 200

function pageWorkspaceEvents(
  listWorkspaceEventsSince: P2pEventServiceModule['listWorkspaceEventsSince'],
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

/**
 * Full `p2p-event.service` mock. Adding a production export will fail typecheck
 * here until the mock is updated — tests should not list exports by hand.
 *
 * This file must not import the real event-service module graph (query/store/db)
 * or `vi.mock('./p2p-event.service')` factories deadlock.
 */
export function createP2pEventServiceMock(
  overrides: Partial<P2pEventServiceModule> = {},
): P2pEventServiceModule {
  const listWorkspaceEventsSince =
    overrides.listWorkspaceEventsSince ??
    mockFn<P2pEventServiceModule['listWorkspaceEventsSince']>(() => [])

  const iterateWorkspaceEventPages =
    overrides.iterateWorkspaceEventPages ??
    ((workspaceId, onPage) => {
      pageWorkspaceEvents(listWorkspaceEventsSince, workspaceId, onPage)
    })

  return {
    bootstrapP2pEventStore: mockFn<P2pEventServiceModule['bootstrapP2pEventStore']>(),
    appendP2pEvent: mockFn<P2pEventServiceModule['appendP2pEvent']>(),
    appendP2pEventLocally: mockFn<P2pEventServiceModule['appendP2pEventLocally']>(),
    listP2pEvents: mockFn<P2pEventServiceModule['listP2pEvents']>(() => ({
      events: [],
      total: 0,
      hasMore: false,
    })),
    getP2pEvent: mockFn<P2pEventServiceModule['getP2pEvent']>(),
    getWorkspaceLatestSeq: mockFn<P2pEventServiceModule['getWorkspaceLatestSeq']>(() => 0),
    markP2pEventSynced: mockFn<P2pEventServiceModule['markP2pEventSynced']>(),
    applyRemoteP2pEvent: mockFn<P2pEventServiceModule['applyRemoteP2pEvent']>(() => null),
    WORKSPACE_EVENT_PAGE_SIZE,
    ...overrides,
    listWorkspaceEventsSince,
    iterateWorkspaceEventPages,
  }
}
