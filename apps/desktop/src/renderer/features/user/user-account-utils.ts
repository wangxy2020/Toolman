import type {
  AuthBuildProfile,
  AuthBindingSummary,
  AuthProvider,
  AuthRegion,
  AuthSession,
  CommunityUserRole,
  ProductSku,
} from '@toolman/shared'

export const USER_TYPE_LABELS = {
  unregistered: '未注册',
  normal: '普通用户',
  vip: 'VIP会员',
  admin: '管理员',
  super_admin: '超级管理员',
} as const

export type UserTypeKey = keyof typeof USER_TYPE_LABELS

/** Dev/test email → user type for dual-account QA (keep in sync with hub dev_test_user_role.rs). */
export const DEV_TEST_USER_TYPE_BY_EMAIL: Record<string, UserTypeKey> = {
  'wxymale@126.com': 'admin',
  '31897124@qq.com': 'normal',
}

export function extractSessionEmail(session: AuthSession | null | undefined): string | null {
  if (!session) return null
  for (const binding of session.bindings) {
    const label = binding.label?.trim()
    if (label && label.includes('@')) {
      return label.toLowerCase()
    }
  }
  return null
}

export function resolveUserTypeLabel(
  session: AuthSession | null | undefined,
  communityRole?: CommunityUserRole | null,
): string {
  const email = extractSessionEmail(session)
  const devType =
    import.meta.env.DEV && email ? DEV_TEST_USER_TYPE_BY_EMAIL[email] : undefined
  if (devType) {
    return USER_TYPE_LABELS[devType]
  }

  if (!session || session.registrationStatus === 'guest') {
    return USER_TYPE_LABELS.unregistered
  }
  if (!session.isLoggedIn) {
    return USER_TYPE_LABELS.normal
  }

  if (communityRole === 'founder') return USER_TYPE_LABELS.super_admin
  if (communityRole === 'admin') return USER_TYPE_LABELS.admin
  if (communityRole === 'enterprise' || session.subscriptionSku === 'pro') {
    return USER_TYPE_LABELS.vip
  }
  return USER_TYPE_LABELS.normal
}

export const PRODUCT_SKU_LABELS: Record<ProductSku, string> = {
  community: '社区版',
  pro: '专业版',
}

export const AUTH_PROVIDER_LABELS: Record<AuthProvider, string> = {
  firebase_email: '邮箱',
  firebase_google: 'Google',
  firebase_apple: 'Apple',
  tencent_phone: '手机号',
  tencent_wechat: '微信',
  tencent_douyin: '抖音',
}

export function inferDefaultAuthRegion(
  profile?: Pick<AuthBuildProfile, 'defaultRegion' | 'allowedRegions'> | null,
): AuthRegion {
  if (profile?.allowedRegions.length === 1) {
    return profile.allowedRegions[0]!
  }

  const locale = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en-us'
  const fromLocale = locale.startsWith('zh') ? 'cn' : 'intl'

  if (profile?.allowedRegions.includes(fromLocale)) {
    return fromLocale
  }

  return profile?.defaultRegion ?? fromLocale
}

export function formatSkuLabel(session: AuthSession | null | undefined): string | null {
  if (!session || session.registrationStatus !== 'registered' || !session.isLoggedIn) {
    return null
  }
  if (!session.subscriptionSku) {
    return PRODUCT_SKU_LABELS.community
  }
  return PRODUCT_SKU_LABELS[session.subscriptionSku]
}

export function formatAccountStatusLabel(session: AuthSession | null | undefined): string {
  if (!session || session.registrationStatus === 'guest') {
    return '访客 · 社区只读'
  }
  if (!session.isLoggedIn) {
    return '已注册 · 未登录'
  }
  const sku = session.subscriptionSku ? PRODUCT_SKU_LABELS[session.subscriptionSku] : '社区版'
  return `${sku} · 已登录`
}

export function formatBindingSummary(binding: AuthBindingSummary): string {
  return binding.label ?? AUTH_PROVIDER_LABELS[binding.provider]
}

export function isRegisteredUser(session: AuthSession | null | undefined): boolean {
  return session?.registrationStatus === 'registered'
}
