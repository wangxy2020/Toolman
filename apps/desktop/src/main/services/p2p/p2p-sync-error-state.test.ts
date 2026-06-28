import { describe, expect, it } from 'vitest'

import { shouldSetWorkspaceIdleAfterPeerSync } from './p2p-sync-error-state'

describe('shouldSetWorkspaceIdleAfterPeerSync', () => {
  it('returns true when sync completed without errors', () => {
    expect(shouldSetWorkspaceIdleAfterPeerSync(false)).toBe(true)
  })

  it('returns false when sync encountered errors so status stays on error', () => {
    expect(shouldSetWorkspaceIdleAfterPeerSync(true)).toBe(false)
  })
})
