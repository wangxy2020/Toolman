import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { sha256Hex } from './sha256'
import { resolveCommunityRole } from './localAuth-role'
import type {
  AuthAccountKind,
  MobileAuthAccountRecord,
  MobileAuthSession,
  MobileAuthStore,
} from './types'

const AUTH_STORE_KEY = 'toolman.mobile.authStore.v1'

export const EMPTY_STORE: MobileAuthStore = { accounts: [], session: null }

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // ignore
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export function migrateAccount(raw: Record<string, unknown>): MobileAuthAccountRecord | null {
  const identityId = typeof raw.identityId === 'string' ? raw.identityId : null
  const email = typeof raw.email === 'string' ? raw.email : ''
  const passwordHash = typeof raw.passwordHash === 'string' ? raw.passwordHash : null
  const salt = typeof raw.salt === 'string' ? raw.salt : null
  if (!identityId || !passwordHash || !salt) return null

  const accountKey =
    typeof raw.accountKey === 'string' && raw.accountKey
      ? raw.accountKey
      : email.trim().toLowerCase()
  if (!accountKey) return null

  const accountKind: AuthAccountKind =
    raw.accountKind === 'phone' || (!email.includes('@') && /^1\d{10}$/.test(accountKey))
      ? 'phone'
      : 'email'

  return {
    identityId,
    displayName:
      typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName
        : accountKind === 'phone'
          ? accountKey
          : accountKey.split('@')[0] || 'Toolman 用户',
    accountKey,
    accountKind,
    email: accountKind === 'email' ? accountKey : typeof raw.email === 'string' ? raw.email : '',
    phone:
      accountKind === 'phone'
        ? accountKey
        : typeof raw.phone === 'string'
          ? raw.phone
          : null,
    wechatBound: raw.wechatBound === true,
    passwordHash,
    salt,
    region: raw.region === 'intl' ? 'intl' : 'cn',
    subscriptionSku: raw.subscriptionSku === 'pro' ? 'pro' : 'community',
    entitlements: Array.isArray(raw.entitlements)
      ? raw.entitlements.filter((item): item is string => typeof item === 'string')
      : [],
    communityRole: resolveCommunityRole({
      communityRole: raw.communityRole,
      entitlements: Array.isArray(raw.entitlements)
        ? raw.entitlements.filter((item): item is string => typeof item === 'string')
        : [],
    }),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

export function migrateSession(
  raw: Record<string, unknown> | null,
  accounts: MobileAuthAccountRecord[],
): MobileAuthSession | null {
  if (!raw || typeof raw.identityId !== 'string' || typeof raw.accessToken !== 'string') {
    return null
  }
  const account = accounts.find((item) => item.identityId === raw.identityId)
  if (!account) return null
  return toSession(account, raw.accessToken)
}

export async function loadAuthStore(): Promise<MobileAuthStore> {
  try {
    const raw = await getItem(AUTH_STORE_KEY)
    if (!raw) return EMPTY_STORE
    const parsed = JSON.parse(raw) as {
      accounts?: unknown[]
      session?: Record<string, unknown> | null
    }
    const accounts = (Array.isArray(parsed.accounts) ? parsed.accounts : [])
      .map((item) =>
        item && typeof item === 'object'
          ? migrateAccount(item as Record<string, unknown>)
          : null,
      )
      .filter((item): item is MobileAuthAccountRecord => Boolean(item))
    return {
      accounts,
      session: migrateSession(parsed.session ?? null, accounts),
    }
  } catch {
    return EMPTY_STORE
  }
}

export async function saveAuthStore(store: MobileAuthStore): Promise<void> {
  await setItem(AUTH_STORE_KEY, JSON.stringify(store))
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${password}`)
}

export function toSession(account: MobileAuthAccountRecord, accessToken: string): MobileAuthSession {
  return {
    identityId: account.identityId,
    displayName: account.displayName,
    email: account.accountKind === 'email' ? account.email : account.phone ?? account.accountKey,
    phone: account.phone,
    wechatBound: Boolean(account.wechatBound),
    accountKind: account.accountKind,
    accessToken,
    region: account.region,
    subscriptionSku: account.subscriptionSku,
    entitlements: account.entitlements,
    communityRole: account.communityRole,
    lastLoginAt: Date.now(),
  }
}

export function mintAccessToken(identityId: string): string {
  return `tm-mobile.${identityId}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`
}


export const OAUTH_PASSWORD_MARKER = 'oauth-external'

export type AuthResult =
  | { ok: true; session: MobileAuthSession }
  | { ok: false; message: string }
