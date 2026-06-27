import { describe, expect, it } from 'vitest'

import {
  IpcChannel,
  checkAuthFeatureAccess,
  isCommunityReadChannel,
  isCommunityWriteChannel,
  isP2pGatedChannel,
  isP2pGuestAllowedChannel,
  resolveIpcAuthFeature,
  type AuthSession,
} from '@toolman/shared'

const guestSession: AuthSession = {
  registrationStatus: 'guest',
  identityId: '00000000-0000-0000-0000-000000000001',
  authRegion: null,
  subscriptionSku: null,
  entitlements: [],
  userType: 'guest',
  authingRoles: [],
  displayName: '本地用户',
  bindings: [],
  isLoggedIn: false,
}

const registeredSession: AuthSession = {
  ...guestSession,
  registrationStatus: 'registered',
  subscriptionSku: 'community',
  isLoggedIn: true,
}

describe('auth feature gate channel map', () => {
  it('treats community resource list as read-only', () => {
    expect(isCommunityReadChannel(IpcChannel.CommunityResourceList)).toBe(true)
    expect(isCommunityWriteChannel(IpcChannel.CommunityResourceList)).toBe(false)
    expect(resolveIpcAuthFeature(IpcChannel.CommunityResourceList)).toBeNull()
  })

  it('treats community install as write', () => {
    expect(isCommunityWriteChannel(IpcChannel.CommunityInstall)).toBe(true)
    expect(resolveIpcAuthFeature(IpcChannel.CommunityInstall)).toBe('community_write')
  })

  it('allows only local p2p device info for guests', () => {
    expect(isP2pGuestAllowedChannel(IpcChannel.P2pDeviceGetInfo)).toBe(true)
    expect(isP2pGatedChannel(IpcChannel.P2pDeviceGetInfo)).toBe(false)
    expect(isP2pGatedChannel(IpcChannel.P2pWorkspaceCreate)).toBe(true)
    expect(resolveIpcAuthFeature(IpcChannel.P2pWorkspaceCreate)).toBe('group')
  })
})

describe('checkAuthFeatureAccess', () => {
  it('allows community read for guests', () => {
    expect(checkAuthFeatureAccess(guestSession, 'community_read').allowed).toBe(true)
  })

  it('blocks community write and group for guests', () => {
    expect(checkAuthFeatureAccess(guestSession, 'community_write').allowed).toBe(false)
    expect(checkAuthFeatureAccess(guestSession, 'group').allowed).toBe(false)
  })

  it('allows write and group for registered logged-in users', () => {
    expect(checkAuthFeatureAccess(registeredSession, 'community_write').allowed).toBe(true)
    expect(checkAuthFeatureAccess(registeredSession, 'group').allowed).toBe(true)
  })
})
