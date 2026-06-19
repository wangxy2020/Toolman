import { describe, expect, it, beforeEach } from 'vitest'
import {
  extractLamportFromPayload,
  nextLamportTimestamp,
  observeRemoteLamport,
  resetLamportClockForTests,
  isSeqConflictError,
} from './p2p-sync-sequencing'

describe('p2p-sync-sequencing', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000099'

  beforeEach(() => {
    resetLamportClockForTests(workspaceId)
  })

  it('increments lamport clocks monotonically', () => {
    const first = nextLamportTimestamp(workspaceId)
    const second = nextLamportTimestamp(workspaceId)
    expect(second).toBeGreaterThan(first)
  })

  it('tracks remote lamport values', () => {
    observeRemoteLamport(workspaceId, 1_700_000_000_000)
    const next = nextLamportTimestamp(workspaceId)
    expect(next).toBeGreaterThan(1_700_000_000_000)
    expect(extractLamportFromPayload({ _lamport: next })).toBe(next)
  })

  it('detects seq conflict errors', () => {
    expect(isSeqConflictError(new Error('UNIQUE constraint failed: p2p_events.workspace_id, p2p_events.seq'))).toBe(
      true,
    )
    expect(isSeqConflictError(new Error('序号冲突：远端事件与本地序号槽位不一致'))).toBe(true)
    expect(isSeqConflictError(new Error('other'))).toBe(false)
  })
})
