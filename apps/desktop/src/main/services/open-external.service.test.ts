import { describe, expect, it, vi } from 'vitest'

const openExternal = vi.fn()

vi.mock('electron', () => ({
  app: { isPackaged: false },
  shell: { openExternal: (...args: unknown[]) => openExternal(...args) },
}))

vi.mock('./structured-log.service', () => ({
  logStructured: vi.fn(),
}))

describe('open-external.service', () => {
  it('allows https and packaged-dev localhost http', async () => {
    const { isSafeExternalUrl, openExternalUrl } = await import('./open-external.service')
    expect(isSafeExternalUrl('https://github.com')).toBe(true)
    expect(isSafeExternalUrl('http://127.0.0.1:5173')).toBe(true)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(openExternalUrl('file:///tmp/x')).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
    expect(openExternalUrl('https://example.com')).toBe(true)
    expect(openExternal).toHaveBeenCalledWith('https://example.com')
  })
})
