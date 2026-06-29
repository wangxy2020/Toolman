import { afterEach, describe, expect, it, vi } from 'vitest'

const { ManagementClientMock } = vi.hoisted(() => ({
  ManagementClientMock: vi.fn(),
}))

vi.mock('authing-js-sdk', () => ({
  ManagementClient: ManagementClientMock,
}))

import { getAuthingManagementClient, resetAuthingManagementClientForTests } from './authing-management-client.service.js'

describe('getAuthingManagementClient', () => {
  afterEach(() => {
    resetAuthingManagementClientForTests()
    vi.unstubAllEnvs()
    ManagementClientMock.mockReset()
  })

  it('uses core.authing.cn for management host instead of app login domain', () => {
    vi.stubEnv('TOOLMAN_AUTHING_APP_ID', 'app-id')
    vi.stubEnv('TOOLMAN_AUTHING_USER_POOL_ID', 'pool-id')
    vi.stubEnv('TOOLMAN_AUTHING_USER_POOL_SECRET', 'pool-secret')
    vi.stubEnv('TOOLMAN_AUTHING_APP_HOST', 'https://my-app.authing.cn')

    getAuthingManagementClient()

    expect(ManagementClientMock).toHaveBeenCalledWith({
      userPoolId: 'pool-id',
      secret: 'pool-secret',
      host: 'https://core.authing.cn',
    })
  })

  it('honors explicit management host override', () => {
    vi.stubEnv('TOOLMAN_AUTHING_APP_ID', 'app-id')
    vi.stubEnv('TOOLMAN_AUTHING_USER_POOL_SECRET', 'pool-secret')
    vi.stubEnv('TOOLMAN_AUTHING_APP_HOST', 'https://my-app.authing.cn')
    vi.stubEnv('TOOLMAN_AUTHING_MANAGEMENT_HOST', 'https://core.example.com')

    getAuthingManagementClient()

    expect(ManagementClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'https://core.example.com' }),
    )
  })
})
