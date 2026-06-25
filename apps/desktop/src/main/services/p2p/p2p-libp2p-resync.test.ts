import { describe, expect, it, vi } from 'vitest'

const registerLibp2pRestartListener = vi.hoisted(() => vi.fn())

vi.mock('./p2p-libp2p-restart', () => ({
  registerLibp2pRestartListener,
}))

vi.mock('../community/community-yjs-provider', () => ({
  resubscribeCommunityYjsPubsub: vi.fn(),
}))

vi.mock('../community/community-federation-provider.service', () => ({
  resubscribeCommunityFederationPubsub: vi.fn(async () => undefined),
}))

vi.mock('../community/community-cid-provider.service', () => ({
  resubscribeCommunityCidPubsub: vi.fn(async () => undefined),
}))

vi.mock('../diagnostics-log', () => ({
  recordDiagnosticEvent: vi.fn(),
}))

import { ensureLibp2pDependentPubsubResync } from './p2p-libp2p-resync'

describe('p2p-libp2p-resync', () => {
  it('registers pubsub resync listener once', () => {
    ensureLibp2pDependentPubsubResync()
    ensureLibp2pDependentPubsubResync()
    expect(registerLibp2pRestartListener).toHaveBeenCalledTimes(1)
  })
})
