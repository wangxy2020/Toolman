import { z } from 'zod'

import type { AuthProvider, AuthRegion } from './ipc/auth.js'

export const AuthBuildRegionSchema = z.enum(['cn', 'intl', 'global'])
export type AuthBuildRegion = z.infer<typeof AuthBuildRegionSchema>

const AuthRegionSchema = z.enum(['cn', 'intl'])

export const AUTH_BUILD_CN_PROVIDERS = ['tencent_phone', 'tencent_wechat'] as const satisfies readonly AuthProvider[]
export const AUTH_BUILD_INTL_PROVIDERS = [
  'firebase_email',
  'firebase_google',
  'firebase_apple',
] as const satisfies readonly AuthProvider[]

export const AuthBuildProfileSchema = z.object({
  buildRegion: AuthBuildRegionSchema,
  allowedRegions: z.array(AuthRegionSchema),
  defaultRegion: AuthRegionSchema,
  regionSwitchEnabled: z.boolean(),
  cnAuthEnabled: z.boolean(),
  intlAuthEnabled: z.boolean(),
})
export type AuthBuildProfile = z.infer<typeof AuthBuildProfileSchema>

export function resolveAllowedRegions(buildRegion: AuthBuildRegion): AuthRegion[] {
  switch (buildRegion) {
    case 'cn':
      return ['cn']
    case 'intl':
      return ['intl']
    case 'global':
      return ['cn', 'intl']
  }
}

export function resolveDefaultRegionForBuild(buildRegion: AuthBuildRegion): AuthRegion {
  if (buildRegion === 'cn') return 'cn'
  if (buildRegion === 'intl') return 'intl'
  return 'intl'
}

export function isAuthProviderInRegion(region: AuthRegion, provider: AuthProvider): boolean {
  if (region === 'cn') {
    return (AUTH_BUILD_CN_PROVIDERS as readonly AuthProvider[]).includes(provider)
  }
  return (AUTH_BUILD_INTL_PROVIDERS as readonly AuthProvider[]).includes(provider)
}

export function isAuthLoginAllowed(
  profile: AuthBuildProfile,
  region: AuthRegion,
  method: AuthProvider,
): boolean {
  if (!profile.allowedRegions.includes(region)) {
    return false
  }
  if (!isAuthProviderInRegion(region, method)) {
    return false
  }
  if (region === 'cn') {
    return profile.cnAuthEnabled
  }
  return profile.intlAuthEnabled
}
