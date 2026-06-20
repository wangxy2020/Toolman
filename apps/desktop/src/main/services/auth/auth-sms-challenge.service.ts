import { createHash, randomInt } from 'node:crypto'

import { AuthLoginError } from './auth-login.error.js'
import { isTencentSmsDevMode } from './tencent-auth.config.js'

const CODE_TTL_MS = 5 * 60 * 1000
const RESEND_INTERVAL_MS = 60 * 1000
const MAX_SENDS_PER_HOUR = 5
const DEV_CODE = '123456'

interface SmsChallenge {
  phone: string
  codeHash: string
  expiresAt: number
  lastSentAt: number
  sendCount: number
  windowStartedAt: number
}

const challenges = new Map<string, SmsChallenge>()

function hashCode(code: string, phone: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex')
}

function generateCode(): string {
  if (isTencentSmsDevMode()) {
    return DEV_CODE
  }
  return String(randomInt(100000, 1000000))
}

export function issueSmsChallenge(phone: string): { code: string; retryAfterSeconds: number } {
  const now = Date.now()
  const existing = challenges.get(phone)

  if (existing) {
    const retryAfterMs = existing.lastSentAt + RESEND_INTERVAL_MS - now
    if (retryAfterMs > 0) {
      throw new AuthLoginError(`请 ${Math.ceil(retryAfterMs / 1000)} 秒后再试`)
    }

    const windowExpired = now - existing.windowStartedAt > 60 * 60 * 1000
    const sendCount = windowExpired ? 1 : existing.sendCount + 1
    if (!windowExpired && sendCount > MAX_SENDS_PER_HOUR) {
      throw new AuthLoginError('验证码发送次数过多，请稍后再试')
    }

    const code = generateCode()
    challenges.set(phone, {
      phone,
      codeHash: hashCode(code, phone),
      expiresAt: now + CODE_TTL_MS,
      lastSentAt: now,
      sendCount,
      windowStartedAt: windowExpired ? now : existing.windowStartedAt,
    })
    return { code, retryAfterSeconds: Math.ceil(RESEND_INTERVAL_MS / 1000) }
  }

  const code = generateCode()
  challenges.set(phone, {
    phone,
    codeHash: hashCode(code, phone),
    expiresAt: now + CODE_TTL_MS,
    lastSentAt: now,
    sendCount: 1,
    windowStartedAt: now,
  })
  return { code, retryAfterSeconds: Math.ceil(RESEND_INTERVAL_MS / 1000) }
}

export function verifySmsChallenge(phone: string, code: string): void {
  const challenge = challenges.get(phone)
  if (!challenge) {
    throw new AuthLoginError('请先获取验证码')
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(phone)
    throw new AuthLoginError('验证码已过期，请重新获取')
  }

  if (hashCode(code.trim(), phone) !== challenge.codeHash) {
    throw new AuthLoginError('验证码错误')
  }

  challenges.delete(phone)
}

export function resetSmsChallengesForTests(): void {
  challenges.clear()
}

export function getDevSmsHint(): string | undefined {
  if (!isTencentSmsDevMode()) return undefined
  return `开发模式验证码：${DEV_CODE}`
}
