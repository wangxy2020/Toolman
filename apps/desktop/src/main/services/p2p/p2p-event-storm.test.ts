import { describe, expect, it, beforeEach } from 'vitest'
import {
  nextLamportTimestamp,
  observeRemoteLamport,
  resetLamportClockForTests,
  isSeqConflictError,
} from './p2p-sync-sequencing'

describe('p2p event storm', () => {
  const workspaceId = '00000000-0000-0000-0000-0000000000aa'
  const memberCount = 10
  const roundsPerMember = 50

  beforeEach(() => {
    resetLamportClockForTests(workspaceId)
  })

  it('keeps lamport monotonic under 10-member concurrent observation bursts', () => {
    let maxObserved = 0

    for (let round = 0; round < roundsPerMember; round += 1) {
      for (let member = 0; member < memberCount; member += 1) {
        const remote = 1_700_000_000_000 + round * memberCount + member
        observeRemoteLamport(workspaceId, remote)
        maxObserved = Math.max(maxObserved, remote)
      }

      const next = nextLamportTimestamp(workspaceId)
      expect(next).toBeGreaterThan(maxObserved)
    }
  })

  it('assigns unique lamport timestamps for rapid local events', () => {
    const timestamps = new Set<number>()

    for (let index = 0; index < memberCount * roundsPerMember; index += 1) {
      const timestamp = nextLamportTimestamp(workspaceId)
      expect(timestamps.has(timestamp)).toBe(false)
      timestamps.add(timestamp)
    }

    expect(timestamps.size).toBe(memberCount * roundsPerMember)
  })

  it('still detects seq conflict signatures under load', () => {
    const errors = [
      new Error('UNIQUE constraint failed: p2p_events.workspace_id, p2p_events.seq'),
      new Error('序号冲突：远端事件与本地序号槽位不一致'),
      new Error('P2P_SYNC_CONFLICT: seq mismatch'),
    ]

    for (const error of errors) {
      expect(isSeqConflictError(error)).toBe(true)
    }
  })
})
