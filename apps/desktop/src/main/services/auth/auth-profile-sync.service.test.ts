import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAuthSession = vi.fn()
const mockGetCommunityHubStatus = vi.fn()
const mockGetIdentityProfile = vi.fn()
const mockExchangeAuthHubToken = vi.fn()
const mockGetUserMe = vi.fn()
const mockUpdateUserMe = vi.fn()
const mockSyncAuthingUserProfileAfterLogin = vi.fn()
const mockResolveRegisteredAccountDisplayName = vi.fn()
const mockInvalidateHubTokenCache = vi.fn()
const mockInvalidateCommunityHubCache = vi.fn()

vi.mock('../auth-session.service', () => ({
  getAuthSession: () => mockGetAuthSession(),
}))

vi.mock('./authing-user-profile.service.js', () => ({
  syncAuthingUserProfileAfterLogin: () => mockSyncAuthingUserProfileAfterLogin(),
}))

vi.mock('../identity.service', () => ({
  getIdentityProfile: () => mockGetIdentityProfile(),
}))

vi.mock('./auth-hub-token.service', () => ({
  exchangeAuthHubToken: () => mockExchangeAuthHubToken(),
}))

vi.mock('./resolve-registered-email', () => ({
  resolveRegisteredAccountDisplayName: (...args: unknown[]) =>
    mockResolveRegisteredAccountDisplayName(...args),
}))

vi.mock('../community/community-hub-auth.service', () => ({
  invalidateHubTokenCache: () => mockInvalidateHubTokenCache(),
}))

vi.mock('../community/community-hub-cache.service', () => ({
  invalidateCommunityHubCache: (...args: unknown[]) => mockInvalidateCommunityHubCache(...args),
}))

vi.mock('../community/community-bridge.service', () => ({
  getCommunityHubStatus: () => mockGetCommunityHubStatus(),
}))

vi.mock('../community/community-ipc.facade', () => ({
  getUserMe: () => mockGetUserMe(),
  updateUserMe: (input: unknown) => mockUpdateUserMe(input),
}))

describe('auth-profile-sync.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockGetAuthSession.mockReturnValue({
      registrationStatus: 'registered',
      isLoggedIn: true,
      identityId: '00000000-0000-0000-0000-000000000001',
      subscriptionSku: 'community',
    })
    mockGetCommunityHubStatus.mockReturnValue({ running: true })
    mockGetIdentityProfile.mockReturnValue({
      displayName: '本地昵称',
    })
    mockResolveRegisteredAccountDisplayName.mockReturnValue(undefined)
    mockExchangeAuthHubToken.mockResolvedValue({
      accessToken: 'hub-token',
      expiresAt: Date.now() + 3600_000,
    })
    mockGetUserMe.mockResolvedValue({
      id: 'user-1',
      identityId: '00000000-0000-0000-0000-000000000001',
      displayName: 'Hub 昵称',
      role: 'user',
      canPublish: true,
      canAcceptTask: true,
      canCreateResource: true,
      isBanned: false,
      statsJson: {},
      createdAt: 1,
      updatedAt: 1,
    })
    mockUpdateUserMe.mockImplementation(async (input) => ({
      id: 'user-1',
      identityId: '00000000-0000-0000-0000-000000000001',
      displayName: input.displayName ?? 'Hub 昵称',
      role: 'user',
      canPublish: true,
      canAcceptTask: true,
      canCreateResource: true,
      isBanned: false,
      statsJson: {},
      createdAt: 1,
      updatedAt: 2,
    }))
    mockSyncAuthingUserProfileAfterLogin.mockResolvedValue(undefined)
  })

  it('skips sync for guest sessions', async () => {
    mockGetAuthSession.mockReturnValue({
      registrationStatus: 'guest',
      isLoggedIn: false,
    })

    const { syncAuthProfileToCommunityHub } = await import('./auth-profile-sync.service')
    await expect(syncAuthProfileToCommunityHub()).resolves.toBeNull()
    expect(mockGetUserMe).not.toHaveBeenCalled()
  })

  it('pushes registered email to community hub when available', async () => {
    mockResolveRegisteredAccountDisplayName.mockReturnValue('user@example.com')

    const { syncAuthProfileToCommunityHub } = await import('./auth-profile-sync.service')
    const profile = await syncAuthProfileToCommunityHub()

    expect(mockInvalidateHubTokenCache).toHaveBeenCalled()
    expect(mockExchangeAuthHubToken).toHaveBeenCalled()
    expect(mockUpdateUserMe).toHaveBeenCalledWith({ displayName: 'user@example.com' })
    expect(mockInvalidateCommunityHubCache).toHaveBeenCalledWith('board-messages')
    expect(profile?.displayName).toBe('user@example.com')
  })

  it('falls back to local display name when email is unavailable', async () => {
    const { syncAuthProfileToCommunityHub } = await import('./auth-profile-sync.service')
    const profile = await syncAuthProfileToCommunityHub()

    expect(mockExchangeAuthHubToken).toHaveBeenCalled()
    expect(mockUpdateUserMe).toHaveBeenCalledWith({ displayName: '本地昵称' })
    expect(profile?.displayName).toBe('本地昵称')
  })

  it('does not patch hub profile when display name already matches', async () => {
    mockResolveRegisteredAccountDisplayName.mockReturnValue('user@example.com')
    mockGetUserMe.mockResolvedValue({
      id: 'user-1',
      identityId: '00000000-0000-0000-0000-000000000001',
      displayName: 'user@example.com',
      role: 'user',
      canPublish: true,
      canAcceptTask: true,
      canCreateResource: true,
      isBanned: false,
      statsJson: {},
      createdAt: 1,
      updatedAt: 1,
    })

    const { syncAuthProfileToCommunityHub } = await import('./auth-profile-sync.service')
    await syncAuthProfileToCommunityHub()

    expect(mockUpdateUserMe).not.toHaveBeenCalled()
    expect(mockInvalidateCommunityHubCache).toHaveBeenCalledWith('board-messages')
  })
})
