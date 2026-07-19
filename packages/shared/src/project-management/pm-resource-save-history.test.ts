import { describe, expect, it } from 'vitest'

import {
  buildMetadataForResourceVersionSwitch,
  buildResourceSaveMetadata,
  PM_RESOURCE_CONTENT_FINGERPRINT_KEY,
  PM_RESOURCE_LAST_SAVED_AT_KEY,
  PM_RESOURCE_SAVE_HISTORY_KEY,
  PM_RESOURCE_SAVE_HISTORY_MAX,
  PM_RESOURCE_VERSION_KEY,
  readResourceLastSavedAt,
  readResourceSaveHistory,
  readResourceVersion,
  readResourceVersionCatalog,
  removeResourceSaveHistoryEntry,
} from './pm-resource-save-history.js'

describe('pm-resource-save-history', () => {
  it('creates version 1 on first save', () => {
    const next = buildResourceSaveMetadata(
      {},
      { resourceCount: 8, contentFingerprint: 'fp-a', savedAt: 1000 },
    )
    expect(next[PM_RESOURCE_VERSION_KEY]).toBe(1)
    expect(next[PM_RESOURCE_LAST_SAVED_AT_KEY]).toBe(1000)
    expect(next[PM_RESOURCE_CONTENT_FINGERPRINT_KEY]).toBe('fp-a')
    expect(readResourceSaveHistory(next)).toEqual([
      { version: 1, savedAt: 1000, resourceCount: 8, contentFingerprint: 'fp-a' },
    ])
  })

  it('does not bump version when content fingerprint is unchanged', () => {
    const first = buildResourceSaveMetadata(
      {},
      { resourceCount: 2, contentFingerprint: 'fp-a', savedAt: 1000 },
    )
    const second = buildResourceSaveMetadata(first, {
      resourceCount: 2,
      contentFingerprint: 'fp-a',
      savedAt: 2000,
    })
    expect(readResourceVersion(second)).toBe(1)
    expect(readResourceLastSavedAt(second)).toBe(2000)
    expect(readResourceSaveHistory(second).map((row) => row.version)).toEqual([1])
  })

  it('does not bump legacy history that has a version but no fingerprint', () => {
    const legacy = {
      [PM_RESOURCE_VERSION_KEY]: 3,
      [PM_RESOURCE_LAST_SAVED_AT_KEY]: 1000,
      [PM_RESOURCE_SAVE_HISTORY_KEY]: [
        { version: 3, savedAt: 1000, resourceCount: 5 },
        { version: 2, savedAt: 900, resourceCount: 4 },
      ],
    }
    const next = buildResourceSaveMetadata(legacy, {
      resourceCount: 5,
      contentFingerprint: 'fp-now',
      savedAt: 2000,
    })
    expect(readResourceVersion(next)).toBe(3)
    expect(readResourceLastSavedAt(next)).toBe(2000)
    expect(next[PM_RESOURCE_CONTENT_FINGERPRINT_KEY]).toBe('fp-now')
    expect(readResourceSaveHistory(next).map((row) => row.version)).toEqual([3, 2])
  })

  it('bumps version when content fingerprint changes', () => {
    const first = buildResourceSaveMetadata(
      {},
      { resourceCount: 2, contentFingerprint: 'fp-a', savedAt: 1000 },
    )
    const second = buildResourceSaveMetadata(first, {
      resourceCount: 3,
      contentFingerprint: 'fp-b',
      savedAt: 2000,
    })
    expect(readResourceVersion(second)).toBe(2)
    expect(readResourceLastSavedAt(second)).toBe(2000)
    expect(readResourceSaveHistory(second).map((row) => row.version)).toEqual([2, 1])
  })

  it('caps history length across content changes', () => {
    let meta: Record<string, unknown> = {}
    for (let i = 0; i < PM_RESOURCE_SAVE_HISTORY_MAX + 3; i += 1) {
      meta = buildResourceSaveMetadata(meta, {
        resourceCount: i,
        contentFingerprint: `fp-${i}`,
        savedAt: 1000 + i,
      })
    }
    const history = readResourceSaveHistory(meta)
    expect(history).toHaveLength(PM_RESOURCE_SAVE_HISTORY_MAX)
    expect(history[0]?.version).toBe(PM_RESOURCE_SAVE_HISTORY_MAX + 3)
    expect(meta[PM_RESOURCE_SAVE_HISTORY_KEY]).toHaveLength(PM_RESOURCE_SAVE_HISTORY_MAX)
  })

  it('removes a history entry and falls back current version', () => {
    const meta = {
      [PM_RESOURCE_VERSION_KEY]: 2,
      [PM_RESOURCE_LAST_SAVED_AT_KEY]: 2000,
      [PM_RESOURCE_CONTENT_FINGERPRINT_KEY]: 'fp-b',
      [PM_RESOURCE_SAVE_HISTORY_KEY]: [
        { version: 2, savedAt: 2000, resourceCount: 4 },
        { version: 1, savedAt: 1000, resourceCount: 3 },
      ],
    }
    const next = removeResourceSaveHistoryEntry(meta, 2)
    expect(readResourceVersion(next)).toBe(1)
    expect(readResourceLastSavedAt(next)).toBe(1000)
    expect(readResourceSaveHistory(next)).toEqual([
      { version: 1, savedAt: 1000, resourceCount: 3 },
    ])
  })

  it('stores catalog snapshot on version bump for later switch', () => {
    const catalog = [
      {
        id: 'r1',
        type: 'labor',
        name: '普通工',
        spec: '',
        unit: '工日',
        pricingUnit: '工日',
        unitPrice: 250,
        applicable: 'all',
        note: '',
        sortOrder: 0,
        parentId: null,
      },
    ]
    const first = buildResourceSaveMetadata(
      {},
      { resourceCount: 1, contentFingerprint: 'fp-a', savedAt: 1000, catalog },
    )
    expect(readResourceSaveHistory(first)[0]?.catalog).toEqual(catalog)
    expect(readResourceVersionCatalog(first, 1)).toEqual(catalog)

    const switched = buildMetadataForResourceVersionSwitch(first, 1)
    expect(switched?.[PM_RESOURCE_VERSION_KEY]).toBe(1)
    expect(switched?.[PM_RESOURCE_CONTENT_FINGERPRINT_KEY]).toBe('fp-a')
  })

  it('returns null when switching to a version without snapshot', () => {
    const meta = {
      [PM_RESOURCE_VERSION_KEY]: 1,
      [PM_RESOURCE_SAVE_HISTORY_KEY]: [{ version: 1, savedAt: 1000, resourceCount: 3 }],
    }
    expect(buildMetadataForResourceVersionSwitch(meta, 1)).toBeNull()
    expect(readResourceVersionCatalog(meta, 1)).toBeNull()
  })
})
