import { describe, expect, it } from 'vitest'

import { nextLibp2pRestartDelayMs } from './p2p-libp2p-restart'

describe('nextLibp2pRestartDelayMs', () => {
  it('uses exponential backoff capped at 60s', () => {
    expect(nextLibp2pRestartDelayMs(1)).toBe(1_000)
    expect(nextLibp2pRestartDelayMs(2)).toBe(2_000)
    expect(nextLibp2pRestartDelayMs(3)).toBe(4_000)
    expect(nextLibp2pRestartDelayMs(10)).toBe(60_000)
  })
})
