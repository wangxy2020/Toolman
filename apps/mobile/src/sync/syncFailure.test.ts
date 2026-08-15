import { describe, expect, it } from 'vitest'
import { classifySyncFailure } from './syncFailure'

describe('classifySyncFailure', () => {
  it('treats connection failures as offline', () => {
    expect(classifySyncFailure(new Error('无法连接桌面 Sync Hub（http://127.0.0.1:17890）'))).toBe(
      'offline',
    )
    expect(classifySyncFailure(new Error('Network request failed'))).toBe('offline')
  })

  it('treats missing pairing as offline, not a sync failure', () => {
    expect(classifySyncFailure(new Error('sync push failed (401)'))).toBe('offline')
    expect(classifySyncFailure(new Error('unauthorized'))).toBe('offline')
  })

  it('treats payload failures as error', () => {
    expect(classifySyncFailure(new Error('invalid push payload'))).toBe('error')
  })
})
