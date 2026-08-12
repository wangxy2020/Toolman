import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { saveAccessToken, saveIdentity } from '../storage/secure'
import { sha256Hex } from './sha256'
import { parseAccountInput } from './account-utils'
import type {
  AuthAccountKind,
  AuthRegion,
  CommunityUserRole,
  MobileAuthAccountRecord,
  MobileAuthSession,
  MobileAuthStore,
  ProductSku,
} from './types'

const AUTH_STORE_KEY = 'toolman.mobile.authStore.v1'

const EMPTY_STORE: MobileAuthStore = { accounts: [], session: null }

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

async function getItem(key: string): Promise<string | null> {
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

async function setItem(key: string, value: string): Promise<void> {
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

function migrateAccount(raw: Record<string, unknown>): MobileAuthAccountRecord | null {
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

function migrateSession(
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

async function saveAuthStore(store: MobileAuthStore): Promise<void> {
  await setItem(AUTH_STORE_KEY, JSON.stringify(store))
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${password}`)
}

function toSession(account: MobileAuthAccountRecord, accessToken: string): MobileAuthSession {
  return {
    identityId: account.identityId,
    displayName: account.displayName,
    email: account.accountKind === 'email' ? account.email : account.phone ?? account.accountKey,
    phone: account.phone,
    accountKind: account.accountKind,
    accessToken,
    region: account.region,
    subscriptionSku: account.subscriptionSku,
    entitlements: account.entitlements,
    communityRole: account.communityRole,
    lastLoginAt: Date.now(),
  }
}

function mintAccessToken(identityId: string): string {
  return `tm-mobile.${identityId}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`
}

const OAUTH_PASSWORD_MARKER = 'oauth-external'

export type AuthResult =
  | { ok: true; session: MobileAuthSession }
  | { ok: false; message: string }

/** Persist Firebase / OAuth identity into the local mobile auth store. */
export async function establishExternalSession(input: {
  externalId: string
  email: string | null
  displayName: string | null
  accessToken: string
  provider: 'firebase_email' | 'firebase_google' | 'firebase_apple' | 'authing'
  region: AuthRegion
}): Promise<AuthResult> {
  const identityId =
    input.provider === 'authing' ? `ag-${input.externalId}` : `fb-${input.externalId}`
  const email = (input.email ?? '').trim().toLowerCase()
  const accountKey = email || `${input.provider}:${input.externalId}`
  const displayName =
    input.displayName?.trim() ||
    (email.includes('@') ? email.split('@')[0] : null) ||
    'Toolman 用户'

  const store = await loadAuthStore()
  const existingIdx = store.accounts.findIndex(
    (item) => item.identityId === identityId || item.accountKey === accountKey,
  )
  const now = Date.now()

  let account: MobileAuthAccountRecord
  if (existingIdx >= 0) {
    const prev = store.accounts[existingIdx]!
    account = {
      ...prev,
      identityId,
      displayName: displayName || prev.displayName,
      accountKey,
      accountKind: 'email',
      email: email || prev.email,
      phone: prev.phone,
      region: input.region,
      updatedAt: now,
    }
  } else {
    account = {
      identityId,
      displayName,
      accountKey,
      accountKind: 'email',
      email,
      phone: null,
      passwordHash: OAUTH_PASSWORD_MARKER,
      salt: input.provider,
      region: input.region,
      subscriptionSku: 'community',
      entitlements: [],
      communityRole: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  const accounts =
    existingIdx >= 0
      ? store.accounts.map((item, idx) => (idx === existingIdx ? account : item))
      : [...store.accounts, account]

  const session: MobileAuthSession = {
    ...toSession(account, input.accessToken),
    email: email || account.displayName,
  }
  await saveAuthStore({ accounts, session })
  await persistSessionCredentials(session)
  return { ok: true, session }
}

export async function registerWithAccount(input: {
  account: string
  password: string
  confirmPassword?: string
  displayName: string
  region: AuthRegion
}): Promise<AuthResult> {
  const parsed = parseAccountInput(input.account, input.region)
  if (!parsed.ok) return parsed
  if (input.password.length < 6) {
    return { ok: false, message: '密码至少 6 位' }
  }
  if (
    typeof input.confirmPassword === 'string' &&
    input.confirmPassword.length > 0 &&
    input.confirmPassword !== input.password
  ) {
    return { ok: false, message: '两次输入的密码不一致' }
  }

  const displayName =
    input.displayName.trim() ||
    (parsed.accountKind === 'email'
      ? parsed.email.split('@')[0] || 'Toolman 用户'
      : parsed.phone!)

  const store = await loadAuthStore()
  if (store.accounts.some((a) => a.accountKey === parsed.accountKey)) {
    return {
      ok: false,
      message: parsed.accountKind === 'phone' ? '该手机号已注册，请直接登录' : '该邮箱已注册，请直接登录',
    }
  }

  const salt = newId('salt')
  const passwordHash = await hashPassword(input.password, salt)
  const now = Date.now()
  const account: MobileAuthAccountRecord = {
    identityId: newId('id'),
    displayName,
    accountKey: parsed.accountKey,
    accountKind: parsed.accountKind,
    email: parsed.email,
    phone: parsed.phone,
    passwordHash,
    salt,
    region: input.region,
    subscriptionSku: 'community',
    entitlements: [],
    communityRole: null,
    createdAt: now,
    updatedAt: now,
  }
  const accessToken = mintAccessToken(account.identityId)
  const session = toSession(account, accessToken)
  await saveAuthStore({
    accounts: [...store.accounts, account],
    session,
  })
  await persistSessionCredentials(session)
  return { ok: true, session }
}

/** @deprecated Prefer registerWithAccount */
export async function registerWithEmail(input: {
  email: string
  password: string
  displayName: string
  region: AuthRegion
}): Promise<AuthResult> {
  return registerWithAccount({
    account: input.email,
    password: input.password,
    displayName: input.displayName,
    region: input.region,
  })
}

export async function loginWithAccount(input: {
  account: string
  password: string
  region: AuthRegion
}): Promise<AuthResult> {
  const parsed = parseAccountInput(input.account, input.region)
  if (!parsed.ok) return parsed
  if (!input.password) return { ok: false, message: '请输入密码' }

  const store = await loadAuthStore()
  const account = store.accounts.find((a) => a.accountKey === parsed.accountKey)
  if (!account) {
    return { ok: false, message: '账号不存在，请先注册' }
  }
  const hash = await hashPassword(input.password, account.salt)
  if (hash !== account.passwordHash) {
    return { ok: false, message: '账号或密码错误' }
  }
  const accessToken = mintAccessToken(account.identityId)
  const session = toSession({ ...account, region: input.region }, accessToken)
  const accounts = store.accounts.map((item) =>
    item.identityId === account.identityId ? { ...item, region: input.region, updatedAt: Date.now() } : item,
  )
  await saveAuthStore({ accounts, session })
  await persistSessionCredentials(session)
  return { ok: true, session }
}

/** @deprecated Prefer loginWithAccount */
export async function loginWithEmail(input: {
  email: string
  password: string
}): Promise<AuthResult> {
  const region: AuthRegion = input.email.includes('@') ? 'intl' : 'cn'
  return loginWithAccount({ account: input.email, password: input.password, region })
}

/** Keep sync credentials in sync with the auth session. */
export async function persistSessionCredentials(
  session: MobileAuthSession | null,
): Promise<void> {
  if (!session) {
    await saveIdentity(null)
    await saveAccessToken(null)
    return
  }
  await saveIdentity({
    identityId: session.identityId,
    displayName: session.displayName,
  })
  await saveAccessToken(session.accessToken)
}

export async function logoutLocal(): Promise<void> {
  const store = await loadAuthStore()
  await saveAuthStore({ ...store, session: null })
  await persistSessionCredentials(null)
}

export async function changePassword(input: {
  identityId: string
  oldPassword: string
  newPassword: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.newPassword.length < 6) {
    return { ok: false, message: '新密码至少 6 位' }
  }
  const store = await loadAuthStore()
  const idx = store.accounts.findIndex((a) => a.identityId === input.identityId)
  if (idx < 0) return { ok: false, message: '账号不存在' }
  const account = store.accounts[idx]!
  const oldHash = await hashPassword(input.oldPassword, account.salt)
  if (oldHash !== account.passwordHash) {
    return { ok: false, message: '当前密码不正确' }
  }
  const salt = newId('salt')
  const passwordHash = await hashPassword(input.newPassword, salt)
  const nextAccount: MobileAuthAccountRecord = {
    ...account,
    salt,
    passwordHash,
    updatedAt: Date.now(),
  }
  const accounts = [...store.accounts]
  accounts[idx] = nextAccount
  await saveAuthStore({ ...store, accounts })
  return { ok: true }
}

export async function resetPasswordWithAccount(input: {
  account: string
  newPassword: string
  confirmPassword?: string
  region: AuthRegion
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = parseAccountInput(input.account, input.region)
  if (!parsed.ok) return parsed
  if (input.newPassword.length < 6) {
    return { ok: false, message: '新密码至少 6 位' }
  }
  if (
    typeof input.confirmPassword === 'string' &&
    input.confirmPassword.length > 0 &&
    input.confirmPassword !== input.newPassword
  ) {
    return { ok: false, message: '两次输入的密码不一致' }
  }
  const store = await loadAuthStore()
  const idx = store.accounts.findIndex((a) => a.accountKey === parsed.accountKey)
  if (idx < 0) {
    return {
      ok: false,
      message: parsed.accountKind === 'phone' ? '未找到该手机号账号' : '未找到该邮箱账号',
    }
  }
  const account = store.accounts[idx]!
  const salt = newId('salt')
  const passwordHash = await hashPassword(input.newPassword, salt)
  const accounts = [...store.accounts]
  accounts[idx] = { ...account, salt, passwordHash, updatedAt: Date.now() }
  await saveAuthStore({ ...store, accounts })
  return { ok: true }
}

/** @deprecated Prefer resetPasswordWithAccount */
export async function resetPasswordWithEmail(input: {
  email: string
  newPassword: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  return resetPasswordWithAccount({
    account: input.email,
    newPassword: input.newPassword,
    region: input.email.includes('@') ? 'intl' : 'cn',
  })
}

export async function deleteAccount(input: {
  identityId: string
  password: string
  confirmation: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.confirmation !== 'DELETE') {
    return { ok: false, message: '请输入 DELETE 确认注销' }
  }
  const store = await loadAuthStore()
  const account = store.accounts.find((a) => a.identityId === input.identityId)
  if (!account) return { ok: false, message: '账号不存在' }
  const hash = await hashPassword(input.password, account.salt)
  if (hash !== account.passwordHash) {
    return { ok: false, message: '密码不正确' }
  }
  await saveAuthStore({
    accounts: store.accounts.filter((a) => a.identityId !== input.identityId),
    session: null,
  })
  await persistSessionCredentials(null)
  return { ok: true }
}

export async function setSubscriptionSku(input: {
  identityId: string
  sku: ProductSku
}): Promise<AuthResult> {
  const store = await loadAuthStore()
  const idx = store.accounts.findIndex((a) => a.identityId === input.identityId)
  if (idx < 0 || !store.session || store.session.identityId !== input.identityId) {
    return { ok: false, message: '请先登录' }
  }
  const entitlements = input.sku === 'pro' ? ['pro', 'group.max_members.pro'] : []
  const account: MobileAuthAccountRecord = {
    ...store.accounts[idx]!,
    subscriptionSku: input.sku,
    entitlements,
    communityRole: resolveCommunityRole({
      communityRole: store.accounts[idx]!.communityRole,
      entitlements,
    }),
    updatedAt: Date.now(),
  }
  const accounts = [...store.accounts]
  accounts[idx] = account
  const session = toSession(account, store.session.accessToken)
  await saveAuthStore({ accounts, session })
  await persistSessionCredentials(session)
  return { ok: true, session }
}

export async function updateDisplayName(input: {
  identityId: string
  displayName: string
}): Promise<AuthResult> {
  const name = input.displayName.trim()
  if (!name) return { ok: false, message: '显示名不能为空' }
  const store = await loadAuthStore()
  const idx = store.accounts.findIndex((a) => a.identityId === input.identityId)
  if (idx < 0 || !store.session || store.session.identityId !== input.identityId) {
    return { ok: false, message: '请先登录' }
  }
  const account = { ...store.accounts[idx]!, displayName: name, updatedAt: Date.now() }
  const accounts = [...store.accounts]
  accounts[idx] = account
  const session = { ...store.session, displayName: name }
  await saveAuthStore({ accounts, session })
  await persistSessionCredentials(session)
  return { ok: true, session }
}

export { parseAccountInput, isCnEmailAccountInput, cnPrimaryActionLabel } from './account-utils'
