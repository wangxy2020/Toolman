import { describe, expect, it, vi } from 'vitest'

const assertRegisteredForFeature = vi.fn()

vi.mock('../auth-feature-gate.service', () => ({
  assertRegisteredForFeature,
}))

describe('p2p-auth.guard', () => {
  it('delegates to auth feature gate for group access', async () => {
    const { assertRegisteredForP2p } = await import('./p2p-auth.guard')
    assertRegisteredForP2p()
    expect(assertRegisteredForFeature).toHaveBeenCalledWith('group')
  })
})
