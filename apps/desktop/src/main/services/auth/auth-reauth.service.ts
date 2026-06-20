import { randomUUID } from 'node:crypto'

import {
  isRecentAuthLogin,
  type AuthDeleteAccountInput,
  type AuthSession,
  type AuthVerifyDeleteReauthInput,
} from '@toolman/shared'

import { AuthLoginError } from './auth-login.error.js'

const REAUTH_TOKEN_TTL_MS = 5 * 60 * 1000

interface PendingReauthToken {
  identityId: string
  expiresAt: number
}

const pendingReauthTokens = new Map<string, PendingReauthToken>()

export function createReauthToken(identityId: string, now = Date.now()): string {
  purgeExpiredReauthTokens(now)
  const token = randomUUID()
  pendingReauthTokens.set(token, {
    identityId,
    expiresAt: now + REAUTH_TOKEN_TTL_MS,
  })
  return token
}

export function consumeReauthToken(
  token: string | undefined,
  identityId: string,
  now = Date.now(),
): boolean {
  if (!token) return false
  purgeExpiredReauthTokens(now)
  const pending = pendingReauthTokens.get(token)
  if (!pending) return false
  pendingReauthTokens.delete(token)
  return pending.identityId === identityId && pending.expiresAt >= now
}

export function assertDeleteAccountReauth(
  input: AuthDeleteAccountInput,
  session: AuthSession,
  now = Date.now(),
): void {
  if (!session.isLoggedIn || session.registrationStatus !== 'registered') {
    throw new AuthLoginError('请先登录后再注销账户')
  }

  if (isRecentAuthLogin(session.lastLoginAt ?? null, now)) {
    return
  }

  if (consumeReauthToken(input.reauthToken, session.identityId, now)) {
    return
  }

  throw new AuthLoginError('注销前需要再次验证身份，请输入密码或短信验证码')
}

export function resetReauthTokensForTests(): void {
  pendingReauthTokens.clear()
}

function purgeExpiredReauthTokens(now: number): void {
  for (const [token, pending] of pendingReauthTokens.entries()) {
    if (pending.expiresAt < now) {
      pendingReauthTokens.delete(token)
    }
  }
}

export type { AuthVerifyDeleteReauthInput }
