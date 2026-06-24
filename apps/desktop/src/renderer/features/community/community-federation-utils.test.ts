import { describe, expect, it } from 'vitest'

import {
  getFederationSourceLabel,
  shouldShowFederationSourceBadge,
} from './community-federation-utils'

describe('community-federation-utils', () => {
  it('hides hub-local resources', () => {
    expect(shouldShowFederationSourceBadge('hub')).toBe(false)
    expect(shouldShowFederationSourceBadge(undefined)).toBe(false)
    expect(getFederationSourceLabel('hub')).toBeNull()
  })

  it('labels federated sources', () => {
    expect(shouldShowFederationSourceBadge('p2p')).toBe(true)
    expect(shouldShowFederationSourceBadge('hub-peer')).toBe(true)
    expect(getFederationSourceLabel('p2p')).toBe('P2P 联邦')
    expect(getFederationSourceLabel('hub-peer')).toBe('Peer Hub')
  })
})
