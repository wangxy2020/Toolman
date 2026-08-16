import { describe, expect, it } from 'vitest'
import { LOCAL_ONLY_SYNC_HUB_ID, shouldDiscardForeignPrivateWorkspace } from './syncIdentity'

describe('shouldDiscardForeignPrivateWorkspace', () => {
  it('discards unstamped data when the only hub belongs to another user', () => {
    expect(shouldDiscardForeignPrivateWorkspace('id-b', { hubIdentityId: null })).toBe(true)
  })

  it('keeps data after a same-user sync', () => {
    expect(shouldDiscardForeignPrivateWorkspace('id-b', { hubIdentityId: 'id-b' })).toBe(false)
  })

  it('does not wipe again after a foreign hub was already discarded', () => {
    expect(
      shouldDiscardForeignPrivateWorkspace('id-b', { hubIdentityId: LOCAL_ONLY_SYNC_HUB_ID }),
    ).toBe(false)
  })
})
