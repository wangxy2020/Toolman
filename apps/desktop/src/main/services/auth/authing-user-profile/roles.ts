import {
  PRO_MEMBERSHIP_ENTITLEMENTS,
  type AuthingRoleProfile,
  type ResolvedAuthingRoleProfile,
} from '@toolman/shared'

const DEFAULT_COMMUNITY_ENTITLEMENTS = ['community.write']

type RoleRecord = {
  code?: string | null
  name?: string | null
}

/** Authing role code/name → Toolman profile. Extend via TOOLMAN_AUTHING_ROLE_MAP_JSON. */
const DEFAULT_AUTHING_ROLE_PROFILES: Record<string, AuthingRoleProfile> = {
  founder: {
    userType: 'super_admin',
    communityRole: 'founder',
    priority: 100,
  },
  super_admin: {
    userType: 'super_admin',
    communityRole: 'founder',
    priority: 95,
  },
  'super-admin': {
    userType: 'super_admin',
    communityRole: 'founder',
    priority: 95,
  },
  admin: {
    userType: 'admin',
    communityRole: 'admin',
    priority: 90,
  },
  administrator: {
    userType: 'admin',
    communityRole: 'admin',
    priority: 90,
  },
  管理员: {
    userType: 'admin',
    communityRole: 'admin',
    priority: 90,
  },
  超级管理员: {
    userType: 'super_admin',
    communityRole: 'founder',
    priority: 100,
  },
  enterprise: {
    userType: 'vip',
    communityRole: 'enterprise',
    subscriptionSku: 'pro',
    entitlements: [...PRO_MEMBERSHIP_ENTITLEMENTS],
    priority: 70,
  },
  vip: {
    userType: 'vip',
    communityRole: 'enterprise',
    subscriptionSku: 'pro',
    entitlements: [...PRO_MEMBERSHIP_ENTITLEMENTS],
    priority: 65,
  },
  pro: {
    userType: 'vip',
    subscriptionSku: 'pro',
    entitlements: [...PRO_MEMBERSHIP_ENTITLEMENTS],
    priority: 60,
  },
  专业版: {
    userType: 'vip',
    subscriptionSku: 'pro',
    entitlements: [...PRO_MEMBERSHIP_ENTITLEMENTS],
    priority: 60,
  },
  user: {
    userType: 'normal',
    communityRole: 'user',
    priority: 10,
  },
  普通用户: {
    userType: 'normal',
    communityRole: 'user',
    priority: 10,
  },
}

function normalizeRoleKey(value: string): string {
  return value.trim().toLowerCase()
}

function loadAuthingRoleProfileMap(): Record<string, AuthingRoleProfile> {
  const raw = process.env.TOOLMAN_AUTHING_ROLE_MAP_JSON?.trim()
  if (!raw) {
    return DEFAULT_AUTHING_ROLE_PROFILES
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, AuthingRoleProfile>
    return { ...DEFAULT_AUTHING_ROLE_PROFILES, ...parsed }
  } catch {
    return DEFAULT_AUTHING_ROLE_PROFILES
  }
}

function roleRecordKeys(role: RoleRecord): string[] {
  const keys = new Set<string>()
  for (const value of [role.code, role.name]) {
    const trimmed = value?.trim()
    if (!trimmed) continue
    keys.add(normalizeRoleKey(trimmed))
  }
  return [...keys]
}

export function resolveAuthingRoleProfile(
  authingRoles: readonly string[],
): ResolvedAuthingRoleProfile {
  const profileMap = loadAuthingRoleProfileMap()
  let best: (AuthingRoleProfile & { matchedKey: string }) | null = null
  const matchedRoles: string[] = []

  for (const rawRole of authingRoles) {
    const key = normalizeRoleKey(rawRole)
    if (!key) continue
    matchedRoles.push(rawRole)
    const profile = profileMap[key]
    if (!profile) continue
    if (!best || profile.priority > best.priority) {
      best = { ...profile, matchedKey: key }
    }
  }

  if (!best) {
    return {
      userType: 'normal',
      communityRole: 'user',
      subscriptionSku: 'community',
      entitlements: [...DEFAULT_COMMUNITY_ENTITLEMENTS],
      matchedRoles,
    }
  }

  return {
    userType: best.userType,
    communityRole: best.communityRole ?? 'user',
    subscriptionSku: best.subscriptionSku ?? 'community',
    entitlements: best.entitlements?.length
      ? [...best.entitlements]
      : [...DEFAULT_COMMUNITY_ENTITLEMENTS],
    matchedRoles,
  }
}

export function extractAuthingRoleCodes(list: unknown): string[] {
  if (!list) return []

  const roles: string[] = []

  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item === 'string' && item.trim()) {
        roles.push(item.trim())
        continue
      }
      if (item && typeof item === 'object') {
        const record = item as RoleRecord
        for (const key of roleRecordKeys(record)) {
          roles.push(key)
        }
        if (record.code?.trim()) roles.push(record.code.trim())
        if (record.name?.trim()) roles.push(record.name.trim())
      }
    }
    return [...new Set(roles)]
  }

  if (typeof list === 'object') {
    const paginated = list as { list?: unknown[]; totalCount?: number }
    if (Array.isArray(paginated.list)) {
      return extractAuthingRoleCodes(paginated.list)
    }
  }

  return roles
}
