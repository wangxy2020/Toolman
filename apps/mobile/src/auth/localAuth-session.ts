import { saveAccessToken, saveIdentity } from '../storage/secure'
import { bindStoredDeviceIdentity } from '../storage/deviceIdentity'
import { parseAccountInput } from './account-utils'
import type {
  AuthAccountKind,
  AuthRegion,
  MobileAuthAccountRecord,
  MobileAuthSession,
} from './types'
import {
  OAUTH_PASSWORD_MARKER,
  hashPassword,
  loadAuthStore,
  mintAccessToken,
  newId,
  saveAuthStore,
  toSession,
  type AuthResult,
} from './localAuth-store'

export async function establishExternalSession(input: {
  externalId: string
  email: string | null
  displayName: string | null
  accessToken: string
  provider: 'firebase_email' | 'firebase_google' | 'firebase_apple' | 'authing'
  region: AuthRegion
  phone?: string | null
}): Promise<AuthResult> {
  const identityId =
    input.provider === 'authing' ? `ag-${input.externalId}` : `fb-${input.externalId}`
  const email = (input.email ?? '').trim().toLowerCase()
  const phone = input.phone?.replace(/^\+86/, '').replace(/\s+/g, '') || null
  const accountKind: AuthAccountKind = phone && !email ? 'phone' : 'email'
  const accountKey = email || phone || `${input.provider}:${input.externalId}`
  const displayName =
    input.displayName?.trim() ||
    (email.includes('@') ? email.split('@')[0] : null) ||
    phone ||
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
      accountKind,
      email: email || prev.email,
      phone: phone || prev.phone,
      wechatBound: prev.wechatBound,
      region: input.region,
      updatedAt: now,
    }
  } else {
    account = {
      identityId,
      displayName,
      accountKey,
      accountKind,
      email,
      phone,
      wechatBound: false,
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
    email: email || phone || account.displayName,
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
    wechatBound: false,
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

/** Keep sync credentials in sync with the auth session. */
export async function persistSessionCredentials(
  session: MobileAuthSession | null,
): Promise<void> {
  if (!session) {
    await saveIdentity(null)
    await saveAccessToken(null)
    await bindStoredDeviceIdentity(null)
    return
  }
  await saveIdentity({
    identityId: session.identityId,
    displayName: session.displayName,
  })
  await saveAccessToken(session.accessToken)
  await bindStoredDeviceIdentity(session.identityId)
}

export async function logoutLocal(): Promise<void> {
  const store = await loadAuthStore()
  await saveAuthStore({ ...store, session: null })
  await persistSessionCredentials(null)
}

