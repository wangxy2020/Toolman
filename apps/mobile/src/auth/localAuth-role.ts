import type { CommunityUserRole } from './types'

const COMMUNITY_ROLES = new Set<CommunityUserRole>([
  'guest',
  'user',
  'enterprise',
  'admin',
  'founder',
])

/** Map Authing-style role codes / entitlement tags → community role (desktop-aligned). */
export function resolveCommunityRole(input: {
  communityRole?: unknown
  entitlements?: string[]
}): CommunityUserRole | null {
  if (typeof input.communityRole === 'string' && COMMUNITY_ROLES.has(input.communityRole as CommunityUserRole)) {
    return input.communityRole as CommunityUserRole
  }
  const tags = input.entitlements ?? []
  const codes = new Set(tags.map((item) => item.trim().toLowerCase()))
  if (
    codes.has('founder') ||
    codes.has('super_admin') ||
    codes.has('super-admin') ||
    codes.has('community.role:founder')
  ) {
    return 'founder'
  }
  if (
    codes.has('admin') ||
    codes.has('administrator') ||
    codes.has('管理员') ||
    codes.has('community.role:admin')
  ) {
    return 'admin'
  }
  if (codes.has('enterprise') || codes.has('community.role:enterprise')) {
    return 'enterprise'
  }
  if (codes.has('user') || codes.has('community.role:user')) {
    return 'user'
  }
  return null
}

export function isCommunityModerator(role?: CommunityUserRole | null): boolean {
  return role === 'admin' || role === 'founder'
}
