import { describe, expect, it } from 'vitest'
import {
  upsertLwwEntity,
  listLwwEntities,
  YJS_ORIGIN_LOCAL,
} from './community-yjs-store'

describe('community-yjs-store LWW', () => {
  it('keeps newer updatedAt entity', () => {
    upsertLwwEntity(
      'board',
      'msg-1',
      { body: 'old' },
      { updatedAt: 100, authorDeviceId: 'a' },
      YJS_ORIGIN_LOCAL,
    )
    upsertLwwEntity(
      'board',
      'msg-1',
      { body: 'new' },
      { updatedAt: 200, authorDeviceId: 'b' },
      YJS_ORIGIN_LOCAL,
    )

    const items = listLwwEntities('board')
    expect(items).toHaveLength(1)
    expect(items[0]?.record.payload.body).toBe('new')
  })

  it('rejects stale update', () => {
    upsertLwwEntity(
      'board',
      'msg-2',
      { body: 'fresh' },
      { updatedAt: 300, authorDeviceId: 'a' },
      YJS_ORIGIN_LOCAL,
    )
    const accepted = upsertLwwEntity(
      'board',
      'msg-2',
      { body: 'stale' },
      { updatedAt: 100, authorDeviceId: 'b' },
      YJS_ORIGIN_LOCAL,
    )

    expect(accepted).toBe(false)
    const record = listLwwEntities('board').find((item) => item.id === 'msg-2')
    expect(record?.record.payload.body).toBe('fresh')
  })
})
