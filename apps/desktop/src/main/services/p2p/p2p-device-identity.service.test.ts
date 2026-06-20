import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnsureCurrent = vi.fn()
const mockUpsert = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-test-userdata',
  },
}))

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({
    update: () => ({
      set: () => ({
        where: () => ({
          run: vi.fn(),
        }),
      }),
    }),
  }),
}))

vi.mock('@toolman/db', () => ({
  AuthSessionRepository: class {
    ensureCurrent() {
      return mockEnsureCurrent()
    }
  },
  createP2pDeviceIdentityRepository: () => ({
    upsert: mockUpsert,
  }),
  identities: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

vi.mock('./p2p-bridge', () => ({
  P2pBridge: {
    deviceIdentityEnsure: vi.fn(() => ({
      deviceId: 'device-1',
      publicKey: 'pk',
      publicKeyFingerprint: 'fp',
      privateKeyRef: 'ref',
      createdAt: 1_700_000_000_000,
    })),
    deviceIdentityGetInfo: vi.fn(() => ({
      deviceId: 'device-1',
      publicKey: 'pk',
      publicKeyFingerprint: 'fp',
      privateKeyRef: 'ref',
      createdAt: 1_700_000_000_000,
    })),
  },
}))

describe('p2p-device-identity.service', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockUpsert.mockClear()
    mockEnsureCurrent.mockReturnValue({
      identityId: '00000000-0000-0000-0000-000000000001',
    })
    mockUpsert.mockImplementation((input) => ({
      deviceId: input.deviceId,
      identityId: input.identityId,
      publicKey: input.publicKey,
      privateKeyRef: input.privateKeyRef,
      createdAt: input.createdAt,
    }))
    const mod = await import('./p2p-device-identity.service')
    mod.resetP2pDeviceIdentityCacheForTests()
  })

  it('binds device identity to the active auth session identity', async () => {
    mockEnsureCurrent.mockReturnValue({
      identityId: '00000000-0000-0000-0000-000000000001',
    })

    const { bindP2pDeviceToIdentity } = await import('./p2p-device-identity.service')
    const bound = bindP2pDeviceToIdentity()

    expect(bound.identityId).toBe('00000000-0000-0000-0000-000000000001')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'device-1',
        identityId: '00000000-0000-0000-0000-000000000001',
      }),
    )
  })
})
