import { describe, expect, it } from 'vitest'

import {
  buildScheduleSaveMetadata,
  computeScheduleTotalDurationDays,
  dedupeVersionBaselines,
  findDuplicateVersionBaselineIds,
  findVersionPlanSnapshot,
  hasAppliedPlanFingerprint,
  isBaselineSnapshotIdenticalToItems,
  isVersionBaselineName,
  isVersionPlanSnapshotName,
  listUserBaselines,
  markPendingAgentScheduleRevision,
  parseVersionFromBaselineName,
  parseVersionPlanSnapshotName,
  countBaselineSnapshotChanges,
  PM_APPLIED_PLAN_RECEIPTS_KEY,
  PM_LAST_SAVED_AT_KEY,
  PM_PENDING_AGENT_REVISION_KEY,
  PM_SAVE_HISTORY_KEY,
  PM_SAVE_HISTORY_MAX,
  PM_SCHEDULE_VERSION_KEY,
  PM_VERSION_PLAN_SNAPSHOT_PREFIX,
  readAppliedPlanReceipts,
  readLastSavedAt,
  readPendingAgentScheduleRevision,
  readSaveHistory,
  readScheduleVersion,
  removeSaveHistoryEntry,
  resolvePmPlanApplyAction,
  shouldStructurallyRestoreBaseline,
  hasAppliedCostPlanFingerprint,
  hasAppliedResourcePlanFingerprint,
  upsertAppliedCostPlanReceipt,
  upsertAppliedPlanReceipt,
  upsertAppliedResourcePlanReceipt,
  versionPlanSnapshotName,
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

  it('first manual save creates version 1 and a history row', () => {
    const next = buildScheduleSaveMetadata({}, { workItemCount: 3, savedAt: 500 })
    expect(readScheduleVersion(next)).toBe(1)
    expect(readLastSavedAt(next)).toBe(500)
    expect(readSaveHistory(next)).toEqual([
      { version: 1, savedAt: 500, workItemCount: 3 },
    ])
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

  it('accepts truthy string/number pending flags', () => {
    expect(readPendingAgentScheduleRevision({ [PM_PENDING_AGENT_REVISION_KEY]: 'true' })).toBe(
      true,
    )
    expect(readPendingAgentScheduleRevision({ [PM_PENDING_AGENT_REVISION_KEY]: 1 })).toBe(true)
  })

  it('parses version baseline names', () => {
    expect(parseVersionFromBaselineName('版本 3')).toBe(3)
    expect(parseVersionFromBaselineName('Version 2')).toBe(2)
    expect(parseVersionFromBaselineName('基线 2026/7/11')).toBeNull()
    expect(isVersionBaselineName('版本 1')).toBe(true)
    expect(isVersionBaselineName('基线 A')).toBe(false)
  })

  it('keeps version plan snapshots separate from user baselines', () => {
    expect(versionPlanSnapshotName(3)).toBe(`${PM_VERSION_PLAN_SNAPSHOT_PREFIX}3`)
    expect(parseVersionPlanSnapshotName('__pm_version_plan__:3')).toBe(3)
    expect(parseVersionPlanSnapshotName('版本 3')).toBe(3)
    expect(parseVersionPlanSnapshotName('基线 手动')).toBeNull()
    expect(isVersionPlanSnapshotName('__pm_version_plan__:1')).toBe(true)
    expect(isVersionPlanSnapshotName('基线 A')).toBe(false)

    const rows = [
      { id: 'plan', name: '__pm_version_plan__:2' },
      { id: 'legacy', name: '版本 2' },
      { id: 'b1', name: '基线 A' },
      { id: 'b2', name: '基线 B' },
    ]
    expect(listUserBaselines(rows).map((row) => row.id)).toEqual(['b1', 'b2'])
    expect(findVersionPlanSnapshot(rows, 2)?.id).toBe('plan')
    expect(findVersionPlanSnapshot([{ id: 'legacy', name: '版本 2' }], 2)?.id).toBe('legacy')
    expect(findVersionPlanSnapshot(rows, 9)).toBeNull()
  })

  it('dedupes version plan snapshots but keeps multiple user baselines', () => {
    const rows = [
      { id: 'a', name: '__pm_version_plan__:3' },
      { id: 'b', name: '版本 3' },
      { id: 'c', name: '__pm_version_plan__:2' },
      { id: 'd', name: '版本 2' },
      { id: 'e', name: '基线手动' },
      { id: 'f', name: '基线手动2' },
    ]
    expect(dedupeVersionBaselines(rows).map((row) => row.id)).toEqual(['a', 'c', 'e', 'f'])
    expect(findDuplicateVersionBaselineIds(rows)).toEqual(['b', 'd'])
  })

  it('dedupes legacy version baselines keeping the newest per version', () => {
    const rows = [
      { id: 'a', name: '版本 3' },
      { id: 'b', name: '版本 3' },
      { id: 'c', name: '版本 2' },
      { id: 'd', name: '版本 2' },
      { id: 'e', name: '基线手动' },
    ]
    expect(dedupeVersionBaselines(rows).map((row) => row.id)).toEqual(['a', 'c', 'e'])
    expect(findDuplicateVersionBaselineIds(rows)).toEqual(['b', 'd'])
  })

  it('removes a history entry and falls back current version', () => {
    const meta = {
      [PM_SCHEDULE_VERSION_KEY]: 2,
      [PM_LAST_SAVED_AT_KEY]: 2000,
      [PM_SAVE_HISTORY_KEY]: [
        { version: 2, savedAt: 2000, workItemCount: 4 },
        { version: 1, savedAt: 1000, workItemCount: 3 },
      ],
    }
    const next = removeSaveHistoryEntry(meta, 2)
    expect(readScheduleVersion(next)).toBe(1)
    expect(readLastSavedAt(next)).toBe(1000)
    expect(readSaveHistory(next).map((row) => row.version)).toEqual([1])
  })

  it('bumps past max history version after restoring an older version', () => {
    const meta = {
      [PM_SCHEDULE_VERSION_KEY]: 2,
      [PM_PENDING_AGENT_REVISION_KEY]: true,
      [PM_SAVE_HISTORY_KEY]: [
        { version: 3, savedAt: 3000, workItemCount: 5 },
        { version: 2, savedAt: 2000, workItemCount: 4 },
        { version: 1, savedAt: 1000, workItemCount: 3 },
      ],
    }
    const next = buildScheduleSaveMetadata(meta, { workItemCount: 6, savedAt: 4000 })
    expect(readScheduleVersion(next)).toBe(4)
    expect(readSaveHistory(next).map((row) => row.version)).toEqual([4, 3, 2, 1])
  })

  it('detects identical baseline snapshots vs live items', () => {
    const snapshot = [
      {
        workItemId: '550e8400-e29b-41d4-a716-446655440001',
        title: 'A',
        startDate: 1000,
        dueDate: 2000,
        progressPercent: 10,
      },
    ]
    const items = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'A',
        startDate: 1000,
        dueDate: 2000,
        progressPercent: 10,
      },
    ]
    expect(isBaselineSnapshotIdenticalToItems(snapshot, items)).toBe(true)
    expect(countBaselineSnapshotChanges(snapshot, items)).toEqual({
      changed: 0,
      unchanged: 1,
      missing: 0,
    })
    expect(
      countBaselineSnapshotChanges(snapshot, [
        { ...items[0]!, startDate: 1500 },
      ]),
    ).toEqual({ changed: 1, unchanged: 0, missing: 0 })
  })

  it('persists applied plan receipts and resolves apply actions', () => {
    const first = upsertAppliedPlanReceipt({}, 'fp-a', 1000)
    expect(readAppliedPlanReceipts(first)).toEqual([{ fingerprint: 'fp-a', appliedAt: 1000 }])
    expect(hasAppliedPlanFingerprint(first, 'fp-a')).toBe(true)
    expect(hasAppliedPlanFingerprint(first, 'fp-b')).toBe(false)

    const second = upsertAppliedPlanReceipt(first, 'fp-b', 2000)
    expect(readAppliedPlanReceipts(second).map((row) => row.fingerprint)).toEqual([
      'fp-b',
      'fp-a',
    ])
    // Re-upsert moves to front and refreshes appliedAt.
    const again = upsertAppliedPlanReceipt(second, 'fp-a', 3000)
    expect(readAppliedPlanReceipts(again)[0]).toEqual({ fingerprint: 'fp-a', appliedAt: 3000 })
    expect(again[PM_APPLIED_PLAN_RECEIPTS_KEY]).toHaveLength(2)

    expect(
      resolvePmPlanApplyAction({
        fingerprint: 'fp-a',
        fingerprintAlreadyApplied: true,
        hasLiveWorkItems: true,
        hasAnyPriorReceipt: true,
      }),
    ).toBe('goToGantt')
    expect(
      resolvePmPlanApplyAction({
        fingerprint: 'fp-new',
        fingerprintAlreadyApplied: false,
        hasLiveWorkItems: false,
        hasAnyPriorReceipt: false,
      }),
    ).toBe('confirm')
    expect(
      resolvePmPlanApplyAction({
        fingerprint: 'fp-new',
        fingerprintAlreadyApplied: false,
        hasLiveWorkItems: true,
        hasAnyPriorReceipt: false,
      }),
    ).toBe('reapply')
    expect(
      resolvePmPlanApplyAction({
        fingerprint: 'fp-new',
        fingerprintAlreadyApplied: false,
        hasLiveWorkItems: false,
        hasAnyPriorReceipt: true,
      }),
    ).toBe('reapply')
  })

  it('persists resource/cost plan receipts independently of plan receipts', () => {
    const withResource = upsertAppliedResourcePlanReceipt({}, 'fp-res', 1000)
    expect(hasAppliedResourcePlanFingerprint(withResource, 'fp-res')).toBe(true)
    expect(hasAppliedPlanFingerprint(withResource, 'fp-res')).toBe(false)
    expect(hasAppliedCostPlanFingerprint(withResource, 'fp-res')).toBe(false)

    const withBoth = upsertAppliedCostPlanReceipt(withResource, 'fp-cost', 2000)
    expect(hasAppliedCostPlanFingerprint(withBoth, 'fp-cost')).toBe(true)
    expect(hasAppliedResourcePlanFingerprint(withBoth, 'fp-res')).toBe(true)
    // Existing metadata keys are preserved.
    const merged = upsertAppliedResourcePlanReceipt({ keep: 1 }, 'fp-x', 3000)
    expect(merged.keep).toBe(1)
  })

  it('chooses structural restore when most snapshot ids are missing', () => {
    expect(shouldStructurallyRestoreBaseline(0, 4)).toBe(false)
    expect(shouldStructurallyRestoreBaseline(1, 4)).toBe(false)
    expect(shouldStructurallyRestoreBaseline(2, 4)).toBe(true)
    expect(shouldStructurallyRestoreBaseline(3, 4)).toBe(true)
    expect(shouldStructurallyRestoreBaseline(0, 0)).toBe(false)
  })

  it('computes schedule total duration from item envelope', () => {
    expect(
      computeScheduleTotalDurationDays([
        { startDate: Date.UTC(2026, 7, 1), dueDate: Date.UTC(2026, 7, 10) },
        { startDate: Date.UTC(2026, 7, 5), dueDate: Date.UTC(2026, 8, 1) },
      ]),
    ).toBeGreaterThanOrEqual(30)
    expect(computeScheduleTotalDurationDays([])).toBeNull()
    expect(
      computeScheduleTotalDurationDays([{ startDate: Date.UTC(2026, 0, 1), dueDate: Date.UTC(2026, 0, 1) }]),
    ).toBe(1)
  })

  it('stores totalDurationDays on bump and preserves it on manual update when omitted', () => {
    const bumped = buildScheduleSaveMetadata(
      { [PM_PENDING_AGENT_REVISION_KEY]: true },
      { workItemCount: 2, totalDurationDays: 45, savedAt: 1000 },
    )
    expect(readSaveHistory(bumped)[0]).toEqual({
      version: 1,
      savedAt: 1000,
      workItemCount: 2,
      totalDurationDays: 45,
    })
    const manual = buildScheduleSaveMetadata(bumped, {
      workItemCount: 3,
      savedAt: 2000,
    })
    expect(readSaveHistory(manual)[0]?.totalDurationDays).toBe(45)
    const refreshed = buildScheduleSaveMetadata(manual, {
      workItemCount: 3,
      totalDurationDays: 50,
      savedAt: 3000,
    })
    expect(readSaveHistory(refreshed)[0]?.totalDurationDays).toBe(50)
  })
})
