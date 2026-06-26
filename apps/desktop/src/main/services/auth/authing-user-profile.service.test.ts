import { describe, expect, it } from 'vitest'

import {
  extractAuthingRoleCodes,
  resolveAuthingRoleProfile,
} from './authing-user-profile.service.js'

describe('authing-user-profile.service', () => {
  it('maps admin role to admin user type', () => {
    const profile = resolveAuthingRoleProfile(['admin'])
    expect(profile.userType).toBe('admin')
    expect(profile.communityRole).toBe('admin')
    expect(profile.matchedRoles).toContain('admin')
  })

  it('maps Chinese admin role name', () => {
    const profile = resolveAuthingRoleProfile(['管理员'])
    expect(profile.userType).toBe('admin')
    expect(profile.communityRole).toBe('admin')
  })

  it('prefers higher priority role when multiple are assigned', () => {
    const profile = resolveAuthingRoleProfile(['user', 'admin'])
    expect(profile.userType).toBe('admin')
    expect(profile.communityRole).toBe('admin')
  })

  it('maps pro role to vip with pro sku', () => {
    const profile = resolveAuthingRoleProfile(['pro'])
    expect(profile.userType).toBe('vip')
    expect(profile.subscriptionSku).toBe('pro')
    expect(profile.entitlements.length).toBeGreaterThan(0)
  })

  it('defaults to normal user when no roles match', () => {
    const profile = resolveAuthingRoleProfile(['unknown-role'])
    expect(profile.userType).toBe('normal')
    expect(profile.communityRole).toBe('user')
    expect(profile.subscriptionSku).toBe('community')
  })

  it('extracts role codes from paginated Authing response', () => {
    const roles = extractAuthingRoleCodes({
      list: [{ code: 'admin', name: '管理员' }],
      totalCount: 1,
    })
    expect(roles).toContain('admin')
    expect(roles).toContain('管理员')
  })
})
