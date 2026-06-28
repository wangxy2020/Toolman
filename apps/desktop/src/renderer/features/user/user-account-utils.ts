import type {
  AuthBuildProfile,
  AuthBindingSummary,
  AuthProvider,
  AuthRegion,
  AuthSession,
  CommunityUserRole,
  ProductSku,
} from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'

export const USER_TYPE_LABELS = {
  unregistered: '未注册',
  normal: '普通用户',
  vip: 'VIP会员',
  admin: '管理员',
  super_admin: '超级管理员',
} as const

export type UserTypeKey = keyof typeof USER_TYPE_LABELS

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

function authUserTypeLabelKey(
  userType: AuthSession['userType'],
): UserTypeKey | null {
  if (userType === 'guest') return null
  if (userType === 'normal') return 'normal'
  if (userType === 'vip') return 'vip'
  if (userType === 'admin') return 'admin'
  if (userType === 'super_admin') return 'super_admin'
  return null
}

/** Map Authing-synced community role to display user type. */
export function communityRoleToUserTypeKey(
  role: CommunityUserRole | null | undefined,
): UserTypeKey | null {
  if (role === 'founder') return 'super_admin'
  if (role === 'admin') return 'admin'
  if (role === 'enterprise') return 'vip'
  if (role === 'user' || role === 'guest') return 'normal'
  return null
}

export function resolveUserTypeLabel(
  session: AuthSession | null | undefined,
  communityRole?: CommunityUserRole | null,
  t?: TranslateFn,
): string {
  const labels = {
    unregistered: t?.('user.labels.role.unregistered') ?? USER_TYPE_LABELS.unregistered,
    normal: t?.('user.labels.role.normal') ?? USER_TYPE_LABELS.normal,
    vip: t?.('user.labels.role.vip') ?? USER_TYPE_LABELS.vip,
    admin: t?.('user.labels.role.admin') ?? USER_TYPE_LABELS.admin,
    super_admin: t?.('user.labels.role.super_admin') ?? USER_TYPE_LABELS.super_admin,
  } as const

  if (!session || session.registrationStatus === 'guest') {
    return labels.unregistered
  }
  if (!session.isLoggedIn) {
    return labels.normal
  }

  const roleKey = communityRoleToUserTypeKey(communityRole ?? session.communityRole)
  if (roleKey) {
    return labels[roleKey]
  }

  const authingTypeKey = authUserTypeLabelKey(session.userType)
  if (authingTypeKey && authingTypeKey !== 'normal') {
    return labels[authingTypeKey]
  }

  if (session.subscriptionSku === 'pro') {
    return labels.vip
  }

  return labels.normal
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

export function formatSkuLabel(session: AuthSession | null | undefined, t?: TranslateFn): string | null {
  const skuLabels: Record<ProductSku, string> = {
    community: t?.('user.labels.sku.community') ?? PRODUCT_SKU_LABELS.community,
    pro: t?.('user.labels.sku.pro') ?? PRODUCT_SKU_LABELS.pro,
  }
  if (!session || session.registrationStatus !== 'registered' || !session.isLoggedIn) {
    return null
  }
  if (!session.subscriptionSku) {
    return skuLabels.community
  }
  return skuLabels[session.subscriptionSku]
}

export function formatAccountStatusLabel(session: AuthSession | null | undefined, t?: TranslateFn): string {
  if (!session || session.registrationStatus === 'guest') {
    return t?.('user.labels.status.guest') ?? '访客 · 社区只读'
  }
  if (!session.isLoggedIn) {
    return t?.('user.labels.status.registeredLoggedOut') ?? '已注册 · 未登录'
  }
  const sku = formatSkuLabel(session, t) ?? (t?.('user.labels.sku.community') ?? '社区版')
  return t?.('user.labels.status.loggedIn', { sku }) ?? `${sku} · 已登录`
}

export function formatBindingSummary(binding: AuthBindingSummary, t?: TranslateFn): string {
  const providerLabel =
    t?.(`user.labels.providers.${binding.provider}`) ?? AUTH_PROVIDER_LABELS[binding.provider]
  return binding.label ?? providerLabel
}

export function isRegisteredUser(session: AuthSession | null | undefined): boolean {
  return session?.registrationStatus === 'registered'
}
