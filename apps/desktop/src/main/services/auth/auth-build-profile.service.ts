import {
  AuthBuildProfileSchema,
  type AuthBuildProfile,
  type AuthBuildRegion,
  type AuthProvider,
  type AuthRegion,
  isAuthLoginAllowed,
  resolveAllowedRegions,
  resolveDefaultRegionForBuild,
} from '@toolman/shared'

import { AuthLoginError } from './auth-login.error.js'
import { getFirebaseAuthConfig } from './firebase-auth.config.js'
import { getTencentWebConfig } from './tencent-auth.config.js'

const BUILD_REGION_ENV_KEYS = ['TOOLMAN_AUTH_BUILD_REGION', 'TOOLMAN_BUILD_REGION'] as const

export function resolveAuthBuildRegion(): AuthBuildRegion {
  for (const key of BUILD_REGION_ENV_KEYS) {
    const raw = process.env[key]?.trim().toLowerCase()
    if (!raw) continue
    if (raw === 'cn' || raw === 'intl' || raw === 'global') {
      return raw
    }
  }
  return 'global'
}

export function getAuthBuildProfile(): AuthBuildProfile {
  const buildRegion = resolveAuthBuildRegion()
  const allowedRegions = resolveAllowedRegions(buildRegion)
  const cnAuthEnabled = buildRegion === 'cn' || buildRegion === 'global'
  const intlAuthEnabled = buildRegion === 'intl' || buildRegion === 'global'

  return AuthBuildProfileSchema.parse({
    buildRegion,
    allowedRegions,
    defaultRegion: resolveDefaultRegionForBuild(buildRegion),
    regionSwitchEnabled: buildRegion === 'global',
    cnAuthEnabled,
    intlAuthEnabled,
  })
}

export function assertAuthLoginAllowed(region: AuthRegion, method: AuthProvider): void {
  const profile = getAuthBuildProfile()
  if (isAuthLoginAllowed(profile, region, method)) {
    return
  }

  if (!profile.allowedRegions.includes(region)) {
    const label = profile.buildRegion === 'cn' ? '国内版' : '国际版'
    throw new AuthLoginError(`当前构建仅支持${label}登录`)
  }

  if (region === 'cn' && !getTencentWebConfig().configured) {
    throw new AuthLoginError('国内登录未配置，请设置 TOOLMAN_AUTHING_* 或 TOOLMAN_TENCENT_* / TOOLMAN_WECHAT_* 环境变量')
  }

  if (region === 'intl' && !getFirebaseAuthConfig()) {
    throw new AuthLoginError('国际登录未配置，请设置 TOOLMAN_FIREBASE_* 环境变量')
  }

  throw new AuthLoginError('当前构建不支持该登录方式')
}

export function assertAuthBindAllowed(provider: AuthProvider): void {
  if (provider === 'tencent_phone' || provider === 'tencent_wechat' || provider === 'tencent_douyin') {
    assertAuthLoginAllowed('cn', provider)
    return
  }
  assertAuthLoginAllowed('intl', provider)
}

export function resetAuthBuildRegionCacheForTests(): void {
  // Reserved for future memoization; env reads are direct today.
}
