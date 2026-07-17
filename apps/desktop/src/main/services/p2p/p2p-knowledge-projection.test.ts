import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listWorkspaceEventsSince: vi.fn(
    (_workspaceId: string, _sinceSeq: number, _limit: number) => [] as unknown[],
  ),
}))

vi.mock('./p2p-event.service', () => ({
  listWorkspaceEventsSince: mocks.listWorkspaceEventsSince,
}))

vi.mock('../structured-log.service', () => ({
  logStructured: vi.fn(),
}))

describe('reconcileKnowledgeSharedResources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listWorkspaceEventsSince.mockReturnValue([])
  })

  it('scans workspace knowledge events without throwing when the log is empty', async () => {
    const { reconcileKnowledgeSharedResources, projectKnowledgeSharedEvent } = await import(
      './p2p-knowledge-projection'
    )

    expect(typeof reconcileKnowledgeSharedResources).toBe('function')
    expect(typeof projectKnowledgeSharedEvent).toBe('function')

    expect(() => reconcileKnowledgeSharedResources('ws-1')).not.toThrow()
    expect(mocks.listWorkspaceEventsSince).toHaveBeenCalledWith('ws-1', 0, 200)
  })
})
