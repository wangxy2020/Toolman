import { describe, expect, it } from 'vitest'

import type { AuthSession } from '@toolman/shared'

import {
  AUTH_PROVIDER_LABELS,
  communityRoleToUserTypeKey,
  formatAccountStatusLabel,
  formatBindingSummary,
  formatSkuLabel,
  inferDefaultAuthRegion,
  isRegisteredUser,
  PRODUCT_SKU_LABELS,
  resolveUserTypeLabel,
  USER_TYPE_LABELS,
} from './user-account-utils'

const baseSession = {
  identityId: '00000000-0000-4000-8000-000000000001',
  authRegion: 'intl',
  subscriptionSku: 'community',
  entitlements: [],
  userType: 'normal',
  authingRoles: [],
  displayName: 'Test User',
  bindings: [],
  preferredRegion: null,
  tokenExpiresAt: null,
  lastLoginAt: null,
} satisfies Omit<AuthSession, 'registrationStatus' | 'isLoggedIn'>

describe('user-account-utils', () => {
  it('labels product SKUs', () => {
    expect(PRODUCT_SKU_LABELS.community).toBe('社区版')
    expect(PRODUCT_SKU_LABELS.pro).toBe('专业版')
  })

  it('formats sku badge for logged-in registered users', () => {
    expect(formatSkuLabel(null)).toBeNull()
    expect(
      formatSkuLabel({
        ...baseSession,
        registrationStatus: 'guest',
        isLoggedIn: false,
      }),
    ).toBeNull()
    expect(
      formatSkuLabel({
        ...baseSession,
        registrationStatus: 'registered',
        isLoggedIn: true,
        subscriptionSku: 'pro',
      }),
    ).toBe('专业版')
    expect(
      formatSkuLabel({
        ...baseSession,
        registrationStatus: 'registered',
        isLoggedIn: true,
        subscriptionSku: null,
      }),
    ).toBe('社区版')
  })

  it('formats account status for guest, registered, and logged-in users', () => {
    expect(formatAccountStatusLabel(null)).toBe('访客 · 社区只读')
    expect(
      formatAccountStatusLabel({
        ...baseSession,
        registrationStatus: 'guest',
        isLoggedIn: false,
      }),
    ).toBe('访客 · 社区只读')
    expect(
      formatAccountStatusLabel({
        ...baseSession,
        registrationStatus: 'registered',
        isLoggedIn: false,
      }),
    ).toBe('已注册 · 未登录')
    expect(
      formatAccountStatusLabel({
        ...baseSession,
        registrationStatus: 'registered',
        isLoggedIn: true,
        subscriptionSku: 'pro',
      }),
    ).toBe('专业版 · 已登录')
  })

  it('formats binding summary with custom label fallback', () => {
    expect(
      formatBindingSummary({
        provider: 'firebase_google',
        subjectId: 'google-1',
        verifiedAt: Date.parse('2026-01-01T00:00:00.000Z'),
      }),
    ).toBe(AUTH_PROVIDER_LABELS.firebase_google)
    expect(
      formatBindingSummary({
        provider: 'tencent_wechat',
        subjectId: 'wx-1',
        label: '微信 · 小王',
        verifiedAt: Date.parse('2026-01-01T00:00:00.000Z'),
      }),
    ).toBe('微信 · 小王')
  })

  it('maps community roles from Authing sync to user type labels', () => {
    expect(communityRoleToUserTypeKey('founder')).toBe('super_admin')
    expect(communityRoleToUserTypeKey('admin')).toBe('admin')
    expect(communityRoleToUserTypeKey('enterprise')).toBe('vip')
    expect(communityRoleToUserTypeKey('user')).toBe('normal')

    expect(
      resolveUserTypeLabel(
        {
          ...baseSession,
          registrationStatus: 'registered',
          isLoggedIn: true,
          communityRole: 'founder',
        },
        'founder',
      ),
    ).toBe(USER_TYPE_LABELS.super_admin)

    expect(
      resolveUserTypeLabel(
        {
          ...baseSession,
          registrationStatus: 'registered',
          isLoggedIn: true,
          communityRole: 'admin',
          userType: 'admin',
          authingRoles: ['admin'],
        },
        'admin',
      ),
    ).toBe(USER_TYPE_LABELS.admin)

    expect(
      resolveUserTypeLabel(
        {
          ...baseSession,
          registrationStatus: 'registered',
          isLoggedIn: true,
          communityRole: 'user',
        },
        'user',
      ),
    ).toBe(USER_TYPE_LABELS.normal)
  })

  it('resolves user type labels for guest users', () => {
    expect(
      resolveUserTypeLabel({
        ...baseSession,
        registrationStatus: 'guest',
        isLoggedIn: false,
      }),
    ).toBe(USER_TYPE_LABELS.unregistered)
  })

  it('detects registered users', () => {
    expect(isRegisteredUser(null)).toBe(false)
    expect(
      isRegisteredUser({
        ...baseSession,
        registrationStatus: 'guest',
        isLoggedIn: false,
      }),
    ).toBe(false)
    expect(
      isRegisteredUser({
        ...baseSession,
        registrationStatus: 'registered',
        isLoggedIn: true,
      }),
    ).toBe(true)
  })

  it('infers default auth region from navigator locale', () => {
    const originalNavigator = globalThis.navigator

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { language: 'zh-CN' },
    })
    expect(inferDefaultAuthRegion()).toBe('cn')

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { language: 'en-US' },
    })
    expect(inferDefaultAuthRegion()).toBe('intl')

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
  })
})
