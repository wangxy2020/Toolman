import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListRoles = vi.fn()
const mockFetchViaAccessToken = vi.fn()

vi.mock('./authing-management-client.service.js', () => ({
  canFetchAuthingUserRoles: () => true,
  getAuthingManagementClient: () => ({
    users: { listRoles: mockListRoles },
  }),
}))

vi.mock('./authing-session-roles.service.js', () => ({
  fetchAuthingUserRolesViaAccessToken: (...args: unknown[]) => mockFetchViaAccessToken(...args),
}))

import { extractAuthingRoleCodes, fetchAuthingUserRoles } from './authing-user-profile.service.js'

describe('fetchAuthingUserRoles', () => {
  beforeEach(() => {
    mockListRoles.mockReset()
    mockFetchViaAccessToken.mockReset()
  })

  it('returns management API roles when available', async () => {
    mockListRoles.mockResolvedValue({ list: [{ code: 'admin', name: '管理员' }] })

    const roles = await fetchAuthingUserRoles('user-1')

    expect(roles).toContain('admin')
    expect(mockFetchViaAccessToken).not.toHaveBeenCalled()
  })

  it('falls back to session token when management API returns empty', async () => {
    mockListRoles.mockResolvedValue({ list: [] })
    mockFetchViaAccessToken.mockResolvedValue({ list: [{ code: 'admin', name: '管理员' }] })

    const roles = await fetchAuthingUserRoles('user-1', { accessToken: 'token-abc' })

    expect(roles).toContain('admin')
    expect(mockFetchViaAccessToken).toHaveBeenCalledWith('token-abc', 'user-1')
  })

  it('falls back to session token when management API throws', async () => {
    mockListRoles.mockRejectedValue(new Error('用户池密钥不正确！'))
    mockFetchViaAccessToken.mockResolvedValue({ list: [{ code: 'founder', name: '超级管理员' }] })

    const roles = await fetchAuthingUserRoles('user-1', { accessToken: 'token-abc' })

    expect(roles).toContain('founder')
    expect(mockFetchViaAccessToken).toHaveBeenCalledWith('token-abc', 'user-1')
  })
})

describe('extractAuthingRoleCodes', () => {
  it('keeps compatibility with paginated role payloads', () => {
    const roles = extractAuthingRoleCodes({
      list: [{ code: 'admin', name: '管理员' }],
      totalCount: 1,
    })
    expect(roles).toContain('admin')
  })
})
