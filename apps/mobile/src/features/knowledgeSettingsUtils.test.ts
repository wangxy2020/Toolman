import { describe, expect, it } from 'vitest'
import {
  knowledgeSettingsTabs,
  knowledgeSettingsTitle,
  parseUrlRefreshIntervalHours,
  parseWatchDebounceMs,
  resolveKnowledgeSettingsKind,
} from './knowledgeSettingsUtils'

describe('knowledgeSettingsUtils', () => {
  it('resolves titles, kind, and tabs', () => {
    expect(knowledgeSettingsTitle('network')).toBe('网络知识库设置')
    expect(
      resolveKnowledgeSettingsKind({
        createdKb: null,
        syncedKb: { id: '1', name: 'S', kind: 'sync', documentCount: 0, updatedAt: 0 },
        activeSection: 'sync',
      }),
    ).toBe('sync')
    expect(knowledgeSettingsTabs(true, false).map((tab) => tab.id)).toEqual([
      'basic',
      'watch',
      'memory',
      'advanced',
    ])
  })

  it('parses watch numbers with defaults', () => {
    expect(parseWatchDebounceMs('0')).toBeGreaterThan(0)
    expect(parseUrlRefreshIntervalHours('2')).toBe(2)
    expect(parseUrlRefreshIntervalHours('-1')).toBeGreaterThanOrEqual(0)
  })
})
