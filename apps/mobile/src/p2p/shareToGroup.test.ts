import { describe, expect, it } from 'vitest'
import { canShareToDesktopGroup } from './shareToGroup'

describe('canShareToDesktopGroup', () => {
  it('blocks readonly members on desktop-origin groups', () => {
    expect(
      canShareToDesktopGroup({
        group: {
          id: 'ws',
          name: 'A',
          createdAt: 1,
          updatedAt: 1,
          origin: 'desktop',
        },
        selfMember: {
          id: 'm',
          displayName: 'B',
          role: 'readonly',
          deviceId: 'phone',
          online: true,
          status: 'active',
        },
      }),
    ).toBe(false)
  })

  it('only proposes on desktop-origin groups for writable members', () => {
    expect(
      canShareToDesktopGroup({
        group: { id: 'local', name: 'L', createdAt: 1, updatedAt: 1, origin: 'local' },
        selfMember: {
          id: 'm',
          displayName: 'B',
          role: 'member',
          deviceId: 'phone',
          online: true,
          status: 'active',
        },
      }),
    ).toBe(false)
    expect(
      canShareToDesktopGroup({
        group: {
          id: 'ws',
          name: 'A',
          createdAt: 1,
          updatedAt: 1,
          origin: 'desktop',
        },
        selfMember: {
          id: 'm',
          displayName: 'B',
          role: 'member',
          deviceId: 'phone',
          online: true,
          status: 'active',
        },
      }),
    ).toBe(true)
  })
})
