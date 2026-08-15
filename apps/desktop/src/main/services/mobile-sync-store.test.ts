import { afterEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-mobile-sync-store-test',
    getName: () => 'Toolman',
  },
}))

import {
  appendSyncChanges,
  pullSyncChanges,
  resetMobileSyncStoreForTests,
} from './mobile-sync-store'

describe('mobile-sync-store pull cursor', () => {
  afterEach(() => {
    resetMobileSyncStoreForTests()
    rmSync(join('/tmp/toolman-mobile-sync-store-test', 'mobile-sync'), {
      recursive: true,
      force: true,
    })
  })

  it('does not skip pages when changelog is longer than the limit', () => {
    appendSyncChanges(
      Array.from({ length: 150 }, (_, index) => ({
        entityKind: 'note' as const,
        entityId: `n${index + 1}`,
        op: 'upsert' as const,
        updatedAt: index + 1,
        payload: { title: `n${index + 1}` },
      })),
    )

    const first = pullSyncChanges({ cursor: null, limit: 100 })
    expect(first.changes).toHaveLength(100)
    expect(first.nextCursor).toBe('100')
    expect(first.hasMore).toBe(true)

    const second = pullSyncChanges({ cursor: first.nextCursor, limit: 100 })
    expect(second.changes).toHaveLength(50)
    expect(second.changes[0]?.entityId).toBe('n101')
    expect(second.hasMore).toBe(false)
    expect(second.nextCursor).toBe('150')
  })

  it('skips identical republishes so the cursor does not move', () => {
    const change = {
      entityKind: 'knowledge_meta' as const,
      entityId: 'kb1',
      op: 'upsert' as const,
      updatedAt: 10,
      payload: { name: 'A', kind: 'sync', documentCount: 1 },
    }
    expect(appendSyncChanges([change]).accepted).toBe(1)
    expect(appendSyncChanges([change]).accepted).toBe(0)
    const pulled = pullSyncChanges({ cursor: null, limit: 10 })
    expect(pulled.changes).toHaveLength(1)
    expect(pulled.nextCursor).toBe('1')
  })
})
