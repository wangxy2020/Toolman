import { describe, expect, it, vi, beforeEach } from 'vitest'

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

vi.mock('../auth-session.service', () => ({
  getAuthSession: () => ({
    identityId: '00000000-0000-0000-0000-000000000001',
    subscriptionSku: 'community',
    entitlements: [],
  }),
}))

vi.mock('../community/community-hub-auth.service', () => ({
  invalidateHubTokenCache: vi.fn(),
}))

vi.mock('../p2p/p2p-workspace-vip-pool.service', () => ({
  refreshOwnedWorkspaceVipPools: vi.fn(),
}))

describe('billing.service', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.TOOLMAN_BILLING_API_URL
    process.env.TOOLMAN_BILLING_MOCK = '1'
  })

  it('creates a placeholder pro order and applies mock payment', async () => {
    const { createBillingOrder, mockPayBillingOrder } = await import('./billing.service')

    const order = createBillingOrder({ sku: 'pro', channel: 'alipay' })
    expect(order.status).toBe('pending')
    expect(order.mockMode).toBe(true)

    const paid = mockPayBillingOrder({ orderId: order.orderId })
    expect(paid.order.status).toBe('paid')
    expect(paid.sessionRefreshed).toBe(true)
  })
})
