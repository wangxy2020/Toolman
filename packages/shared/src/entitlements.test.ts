import { describe, expect, it } from 'vitest'
import {
  GROUP_MAX_MEMBERS_COMMUNITY,
  GROUP_MAX_MEMBERS_PRO,
  resolveGroupMaxMembers,
  shouldWarnGroupMemberLimit,
} from './entitlements'

describe('resolveGroupMaxMembers', () => {
  it('defaults to community cap', () => {
    expect(resolveGroupMaxMembers({ subscriptionSku: 'community', entitlements: [] })).toBe(
      GROUP_MAX_MEMBERS_COMMUNITY,
    )
  })

  it('uses pro sku cap', () => {
    expect(resolveGroupMaxMembers({ subscriptionSku: 'pro', entitlements: [] })).toBe(
      GROUP_MAX_MEMBERS_PRO,
    )
  })

  it('prefers explicit entitlement value', () => {
    expect(
      resolveGroupMaxMembers({
        subscriptionSku: 'community',
        entitlements: ['group.max_members:30'],
      }),
    ).toBe(30)
  })
})

describe('shouldWarnGroupMemberLimit', () => {
  it('warns community users at one slot remaining', () => {
    expect(
      shouldWarnGroupMemberLimit(
        { subscriptionSku: 'community', entitlements: [] },
        9,
        10,
      ),
    ).toBe(true)
  })

  it('skips pro users', () => {
    expect(
      shouldWarnGroupMemberLimit({ subscriptionSku: 'pro', entitlements: [] }, 9, 10),
    ).toBe(false)
  })
})

describe('formatVipPoolJoinRequiredMessage', () => {
  it('mentions vip-only group', async () => {
    const { formatVipPoolJoinRequiredMessage } = await import('./entitlements')
    expect(formatVipPoolJoinRequiredMessage()).toContain('会员专属群')
  })
})
