import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAuthSession = vi.fn()
const mockGetCommunityHubStatus = vi.fn()
const mockGetIdentityProfile = vi.fn()
const mockExchangeAuthHubToken = vi.fn()
const mockGetUserMe = vi.fn()
const mockUpdateUserMe = vi.fn()

vi.mock('../auth-session.service', () => ({
  getAuthSession: () => mockGetAuthSession(),
}))

vi.mock('../identity.service', () => ({
  getIdentityProfile: () => mockGetIdentityProfile(),
}))

vi.mock('./auth-hub-token.service', () => ({
  exchangeAuthHubToken: () => mockExchangeAuthHubToken(),
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

  it('pushes local display name to community hub when it differs', async () => {
    const { syncAuthProfileToCommunityHub } = await import('./auth-profile-sync.service')
    const profile = await syncAuthProfileToCommunityHub()

    expect(mockExchangeAuthHubToken).toHaveBeenCalled()
    expect(mockUpdateUserMe).toHaveBeenCalledWith({ displayName: '本地昵称' })
    expect(profile?.displayName).toBe('本地昵称')
  })

  it('does not patch hub profile when display name already matches', async () => {
    mockGetUserMe.mockResolvedValue({
      id: 'user-1',
      identityId: '00000000-0000-0000-0000-000000000001',
      displayName: '本地昵称',
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
  })
})
