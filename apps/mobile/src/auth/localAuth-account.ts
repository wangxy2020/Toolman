import { parseAccountInput } from './account-utils'
import { resolveCommunityRole } from './localAuth-role'
import type { AuthRegion, MobileAuthAccountRecord, ProductSku } from './types'
import {
  hashPassword,
  loadAuthStore,
  newId,
  saveAuthStore,
  toSession,
  type AuthResult,
} from './localAuth-store'
import { persistSessionCredentials } from './localAuth-session'

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
  if (!name) return { ok: false, message: '显示名称不能为空' }
  if (name.length > 10) return { ok: false, message: '显示名称不能超过 10 个字符' }
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

export async function bindPhoneToAccount(input: {
  identityId: string
  phone: string
}): Promise<AuthResult> {
  const parsed = parseAccountInput(input.phone, 'cn')
  if (!parsed.ok) return parsed
  if (parsed.accountKind !== 'phone' || !parsed.phone) {
    return { ok: false, message: '请输入有效的 11 位手机号' }
  }
  const store = await loadAuthStore()
  const idx = store.accounts.findIndex((a) => a.identityId === input.identityId)
  if (idx < 0 || !store.session || store.session.identityId !== input.identityId) {
    return { ok: false, message: '请先登录' }
  }
  const taken = store.accounts.some(
    (item, i) => i !== idx && item.phone === parsed.phone,
  )
  if (taken) {
    return { ok: false, message: '该手机号已绑定其他账户' }
  }
  const account: MobileAuthAccountRecord = {
    ...store.accounts[idx]!,
    phone: parsed.phone,
    updatedAt: Date.now(),
  }
  const accounts = [...store.accounts]
  accounts[idx] = account
  const session = toSession(account, store.session.accessToken)
  await saveAuthStore({ accounts, session })
  await persistSessionCredentials(session)
  return { ok: true, session }
}

