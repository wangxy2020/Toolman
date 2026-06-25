import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('auth-dev-guard', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.TOOLMAN_AUTHING_DEV_MODE
  })

  it('allows dev env in unpackaged builds', async () => {
    vi.doMock('electron', () => ({ app: { isPackaged: false } }))
    process.env.TOOLMAN_AUTHING_DEV_MODE = '1'
    const { isDevModeEnvEnabled } = await import('./auth-dev-guard')
    expect(isDevModeEnvEnabled(['TOOLMAN_AUTHING_DEV_MODE'])).toBe(true)
  })

  it('ignores dev env in packaged builds', async () => {
    vi.doMock('electron', () => ({ app: { isPackaged: true } }))
    process.env.TOOLMAN_AUTHING_DEV_MODE = '1'
    const { isDevModeEnvEnabled } = await import('./auth-dev-guard')
    expect(isDevModeEnvEnabled(['TOOLMAN_AUTHING_DEV_MODE'])).toBe(false)
  })

  it('throws when packaged build has forbidden auth env', async () => {
    vi.doMock('electron', () => ({ app: { isPackaged: true } }))
    process.env.TOOLMAN_WECHAT_DEV_MODE = '1'
    const { assertProductionAuthProfile } = await import('./auth-dev-guard')
    expect(() => assertProductionAuthProfile()).toThrow('forbids TOOLMAN_WECHAT_DEV_MODE')
  })
})
