import { describe, expect, it } from 'vitest'

import {
  buildFeatureSaveMetadata,
  PM_FEATURE_CONTENT_FINGERPRINT_KEY,
  PM_FEATURE_SAVE_HISTORY_KEY,
  PM_FEATURE_SAVE_HISTORY_MAX,
  PM_FEATURE_VERSION_KEY,
  readFeatureSaveHistory,
  readFeatureVersion,
  removeFeatureSaveHistoryEntry,
} from './pm-feature-save-history.js'

describe('pm-feature-save-history', () => {
  it('creates v1 on first save even when bumpVersion is false', () => {
    const next = buildFeatureSaveMetadata(
      {},
      {
        featureCount: 2,
        contentFingerprint: 'fp-a',
        bumpVersion: false,
        catalog: [],
      },
    )
    expect(next[PM_FEATURE_VERSION_KEY]).toBe(1)
    expect(next[PM_FEATURE_CONTENT_FINGERPRINT_KEY]).toBe('fp-a')
    expect(readFeatureSaveHistory(next)).toHaveLength(1)
  })

  it('does not bump when bumpVersion is false and version already exists', () => {
    const first = buildFeatureSaveMetadata(
      {},
      { featureCount: 1, contentFingerprint: 'fp-a', bumpVersion: true },
    )
    const second = buildFeatureSaveMetadata(first, {
      featureCount: 2,
      contentFingerprint: 'fp-b',
      bumpVersion: false,
    })
    expect(readFeatureVersion(second)).toBe(1)
    expect(second[PM_FEATURE_CONTENT_FINGERPRINT_KEY]).toBe('fp-b')
  })

  it('bumps when bumpVersion is true', () => {
    const first = buildFeatureSaveMetadata(
      {},
      { featureCount: 1, contentFingerprint: 'fp-a', bumpVersion: false },
    )
    const second = buildFeatureSaveMetadata(first, {
      featureCount: 1,
      contentFingerprint: 'fp-a',
      bumpVersion: true,
      note: 'checkpoint',
    })
    expect(readFeatureVersion(second)).toBe(2)
    expect(readFeatureSaveHistory(second)[0]?.note).toBe('checkpoint')
  })

  it('caps history length', () => {
    let meta: Record<string, unknown> = {}
    for (let i = 0; i < PM_FEATURE_SAVE_HISTORY_MAX + 3; i += 1) {
      meta = buildFeatureSaveMetadata(meta, {
        featureCount: i,
        contentFingerprint: `fp-${i}`,
        bumpVersion: true,
      })
    }
    expect(readFeatureSaveHistory(meta)).toHaveLength(PM_FEATURE_SAVE_HISTORY_MAX)
  })

  it('removes history entry and falls back current version', () => {
    let meta = buildFeatureSaveMetadata(
      {},
      { featureCount: 1, contentFingerprint: 'fp-1', bumpVersion: true },
    )
    meta = buildFeatureSaveMetadata(meta, {
      featureCount: 2,
      contentFingerprint: 'fp-2',
      bumpVersion: true,
    })
    expect(readFeatureVersion(meta)).toBe(2)
    const next = removeFeatureSaveHistoryEntry(meta, 2)
    expect(readFeatureVersion(next)).toBe(1)
    expect(next[PM_FEATURE_SAVE_HISTORY_KEY]).toHaveLength(1)
  })
})
