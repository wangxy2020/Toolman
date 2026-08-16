import { describe, expect, it } from 'vitest'
import { LOCAL_ONLY_SYNC_HUB_ID, shouldDiscardForeignPrivateWorkspace } from './syncIdentity'

describe('shouldDiscardForeignPrivateWorkspace', () => {
  it('keeps unstamped local data (never wipe on first foreign false-positive)', () => {
    expect(shouldDiscardForeignPrivateWorkspace('id-b', { hubIdentityId: null })).toBe(false)
  })

  it('keeps data after a same-user sync', () => {
    expect(shouldDiscardForeignPrivateWorkspace('id-b', { hubIdentityId: 'id-b' })).toBe(false)
  })

  it('does not wipe again after a foreign hub was already discarded', () => {
    expect(
      shouldDiscardForeignPrivateWorkspace('id-b', { hubIdentityId: LOCAL_ONLY_SYNC_HUB_ID }),
    ).toBe(false)
  })

  it('discards when a previous hub stamp belongs to another account', () => {
    expect(shouldDiscardForeignPrivateWorkspace('id-b', { hubIdentityId: 'id-a' })).toBe(true)
  })
})
