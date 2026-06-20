import { createHash, randomUUID } from 'node:crypto'

import { AuthLoginError } from './auth-login.error.js'
import type { WechatAuthIdentity } from './wechat-oauth.service.js'

const MERGE_TTL_MS = 10 * 60 * 1000

interface PendingWechatMerge {
  wechat: WechatAuthIdentity
  expectedPhone: string
  expiresAt: number
}

const pendingMerges = new Map<string, PendingWechatMerge>()

export function createWechatMergeToken(wechat: WechatAuthIdentity, expectedPhone: string): string {
  cleanupExpired()
  const mergeToken = randomUUID()
  pendingMerges.set(mergeToken, {
    wechat,
    expectedPhone,
    expiresAt: Date.now() + MERGE_TTL_MS,
  })
  return mergeToken
}

export function consumeWechatMergeToken(
  mergeToken: string,
  phone: string,
): WechatAuthIdentity {
  cleanupExpired()
  const pending = pendingMerges.get(mergeToken)
  if (!pending) {
    throw new AuthLoginError('合并请求已过期，请重新发起微信登录')
  }
  if (pending.expectedPhone !== phone) {
    throw new AuthLoginError('请输入已绑定账户的手机号以完成合并')
  }
  pendingMerges.delete(mergeToken)
  return pending.wechat
}

function cleanupExpired(): void {
  const now = Date.now()
  for (const [token, pending] of pendingMerges.entries()) {
    if (pending.expiresAt <= now) {
      pendingMerges.delete(token)
    }
  }
}

export function resetWechatMergeTokensForTests(): void {
  pendingMerges.clear()
}

export function hashWechatMergeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12)
}
