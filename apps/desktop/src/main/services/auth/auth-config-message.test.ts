import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

describe('formatAuthProviderNotConfiguredMessage', () => {
  it('returns developer hints in unpackaged builds', async () => {
    const { formatAuthProviderNotConfiguredMessage } = await import('./auth-config-message')
    expect(formatAuthProviderNotConfiguredMessage('firebase')).toContain('TOOLMAN_FIREBASE_')
    expect(formatAuthProviderNotConfiguredMessage('cn')).toContain('TOOLMAN_AUTHING_')
  })

  it('returns user-friendly hints in packaged builds', async () => {
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: { isPackaged: true },
    }))
    const { formatAuthProviderNotConfiguredMessage } = await import('./auth-config-message')
    expect(formatAuthProviderNotConfiguredMessage('firebase')).toContain('联系支持')
    expect(formatAuthProviderNotConfiguredMessage('cn')).toContain('联系支持')
  })
})
