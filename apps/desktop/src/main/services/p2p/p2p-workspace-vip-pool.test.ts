import { describe, expect, it, vi } from 'vitest'

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: vi.fn(),
        }),
      }),
    }),
  }),
}))

vi.mock('../auth/entitlement.service', () => ({
  getEntitlementContext: () => ({ subscriptionSku: 'pro', entitlements: [] }),
}))

vi.mock('./p2p-device-identity.service', () => ({
  getP2pDeviceInfo: () => ({ deviceId: 'device-1', identityId: 'identity-1' }),
}))

vi.mock('./p2p-event.service', () => ({
  appendP2pEvent: vi.fn(),
}))

describe('p2p-workspace-vip-pool helpers', () => {
  it('reads subscription sku from cert json', async () => {
    const { buildMemberCertSnapshot, parseMemberCertSnapshot } = await import(
      './p2p-workspace-vip-pool.service'
    )
    const cert = buildMemberCertSnapshot({ subscriptionSku: 'pro', entitlements: [] })
    expect(parseMemberCertSnapshot(cert).subscriptionSku).toBe('pro')
  })

  it('maps pro sku to pro context', async () => {
    const { entitlementContextFromJoinerSku } = await import('./p2p-workspace-vip-pool.service')
    expect(entitlementContextFromJoinerSku('pro')).toEqual({
      subscriptionSku: 'pro',
      entitlements: [],
    })
  })

  it('uses stable vip required error code', async () => {
    const { P2pMemberVipRequiredError } = await import('./p2p-workspace-vip-pool.service')
    const error = new P2pMemberVipRequiredError()
    expect(error.code).toBe('P2P_MEMBER_VIP_REQUIRED')
    expect(error.message).toContain('会员专属群')
  })
})
