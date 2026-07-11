import { describe, expect, it } from 'vitest'

import {
  buildScheduleSaveMetadata,
  markPendingAgentScheduleRevision,
  PM_LAST_SAVED_AT_KEY,
  PM_PENDING_AGENT_REVISION_KEY,
  PM_SAVE_HISTORY_KEY,
  PM_SAVE_HISTORY_MAX,
  PM_SCHEDULE_VERSION_KEY,
  readLastSavedAt,
  readPendingAgentScheduleRevision,
  readSaveHistory,
  readScheduleVersion,
} from './pm-save-history.js'

describe('pm-save-history', () => {
  it('bumps to version 1 when pending agent revision', () => {
    const pending = markPendingAgentScheduleRevision({})
    const next = buildScheduleSaveMetadata(pending, { workItemCount: 5, savedAt: 1000 })
    expect(next[PM_SCHEDULE_VERSION_KEY]).toBe(1)
    expect(next[PM_LAST_SAVED_AT_KEY]).toBe(1000)
    expect(next[PM_PENDING_AGENT_REVISION_KEY]).toBe(false)
    expect(readSaveHistory(next)).toEqual([
      { version: 1, savedAt: 1000, workItemCount: 5 },
    ])
  })

  it('bumps version when bumpVersion is forced', () => {
    const first = buildScheduleSaveMetadata(
      { [PM_PENDING_AGENT_REVISION_KEY]: true },
      { workItemCount: 2, savedAt: 1000 },
    )
    const second = buildScheduleSaveMetadata(first, {
      workItemCount: 3,
      savedAt: 2000,
      bumpVersion: true,
    })
    expect(readScheduleVersion(second)).toBe(2)
    expect(readLastSavedAt(second)).toBe(2000)
    expect(readSaveHistory(second).map((row) => row.version)).toEqual([2, 1])
  })

  it('manual save updates current version without bumping', () => {
    const afterAgent = buildScheduleSaveMetadata(
      { [PM_PENDING_AGENT_REVISION_KEY]: true },
      { workItemCount: 2, savedAt: 1000 },
    )
    const manual = buildScheduleSaveMetadata(afterAgent, {
      workItemCount: 4,
      savedAt: 3000,
    })
    expect(readScheduleVersion(manual)).toBe(1)
    expect(readLastSavedAt(manual)).toBe(3000)
    expect(readSaveHistory(manual)).toEqual([
      { version: 1, savedAt: 3000, workItemCount: 4 },
    ])
    expect(readPendingAgentScheduleRevision(manual)).toBe(false)
  })

  it('manual save with no version only stamps lastSavedAt', () => {
    const next = buildScheduleSaveMetadata({}, { workItemCount: 3, savedAt: 500 })
    expect(readScheduleVersion(next)).toBe(0)
    expect(readLastSavedAt(next)).toBe(500)
    expect(readSaveHistory(next)).toEqual([])
  })

  it('agent apply then save creates next version after manual updates', () => {
    let meta = buildScheduleSaveMetadata(
      { [PM_PENDING_AGENT_REVISION_KEY]: true },
      { workItemCount: 1, savedAt: 1 },
    )
    meta = buildScheduleSaveMetadata(meta, { workItemCount: 2, savedAt: 2 })
    meta = markPendingAgentScheduleRevision(meta)
    meta = buildScheduleSaveMetadata(meta, { workItemCount: 5, savedAt: 3 })
    expect(readScheduleVersion(meta)).toBe(2)
    expect(readSaveHistory(meta).map((row) => row.version)).toEqual([2, 1])
    expect(readSaveHistory(meta)[0]).toEqual({ version: 2, savedAt: 3, workItemCount: 5 })
  })

  it('preserves unrelated metadata keys', () => {
    const next = buildScheduleSaveMetadata(
      { planPhase: '施工', contractValue: 100, [PM_PENDING_AGENT_REVISION_KEY]: true },
      { workItemCount: 1, savedAt: 1 },
    )
    expect(next.planPhase).toBe('施工')
    expect(next.contractValue).toBe(100)
  })

  it('caps history length on bump', () => {
    let meta: Record<string, unknown> = {}
    for (let i = 0; i < PM_SAVE_HISTORY_MAX + 5; i += 1) {
      meta = buildScheduleSaveMetadata(meta, {
        workItemCount: i,
        savedAt: i + 1,
        bumpVersion: true,
      })
    }
    const history = readSaveHistory(meta)
    expect(history).toHaveLength(PM_SAVE_HISTORY_MAX)
    expect(history[0]?.version).toBe(PM_SAVE_HISTORY_MAX + 5)
    expect(meta[PM_SAVE_HISTORY_KEY]).toHaveLength(PM_SAVE_HISTORY_MAX)
  })

  it('ignores malformed history entries', () => {
    expect(
      readSaveHistory({
        [PM_SAVE_HISTORY_KEY]: [{ version: 1 }, { version: 2, savedAt: 1, workItemCount: 0 }],
      }),
    ).toEqual([{ version: 2, savedAt: 1, workItemCount: 0 }])
  })
})
