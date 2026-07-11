import { describe, expect, it } from 'vitest'

import {
  buildScheduleSaveMetadata,
  PM_LAST_SAVED_AT_KEY,
  PM_SAVE_HISTORY_KEY,
  PM_SAVE_HISTORY_MAX,
  PM_SCHEDULE_VERSION_KEY,
  readLastSavedAt,
  readSaveHistory,
  readScheduleVersion,
} from './pm-save-history.js'

describe('pm-save-history', () => {
  it('starts version at 1 on first save', () => {
    const next = buildScheduleSaveMetadata({}, { workItemCount: 5, savedAt: 1000 })
    expect(next[PM_SCHEDULE_VERSION_KEY]).toBe(1)
    expect(next[PM_LAST_SAVED_AT_KEY]).toBe(1000)
    expect(readSaveHistory(next)).toEqual([
      { version: 1, savedAt: 1000, workItemCount: 5 },
    ])
  })

  it('increments version and prepends history', () => {
    const first = buildScheduleSaveMetadata({}, { workItemCount: 2, savedAt: 1000 })
    const second = buildScheduleSaveMetadata(first, { workItemCount: 3, savedAt: 2000 })
    expect(readScheduleVersion(second)).toBe(2)
    expect(readLastSavedAt(second)).toBe(2000)
    expect(readSaveHistory(second).map((row) => row.version)).toEqual([2, 1])
  })

  it('preserves unrelated metadata keys', () => {
    const next = buildScheduleSaveMetadata(
      { planPhase: '施工', contractValue: 100 },
      { workItemCount: 1, savedAt: 1 },
    )
    expect(next.planPhase).toBe('施工')
    expect(next.contractValue).toBe(100)
  })

  it('caps history length', () => {
    let meta: Record<string, unknown> = {}
    for (let i = 0; i < PM_SAVE_HISTORY_MAX + 5; i += 1) {
      meta = buildScheduleSaveMetadata(meta, { workItemCount: i, savedAt: i + 1 })
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
