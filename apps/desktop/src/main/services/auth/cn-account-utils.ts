import { AuthLoginError } from './auth-login.error.js'
import { maskPhone, normalizeCnPhone } from './phone-utils.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CnAuthAccountChannel = 'phone' | 'email'

export interface ParsedCnAuthAccount {
  channel: CnAuthAccountChannel
  normalized: string
  phone?: string
  email?: string
}

export function isCnAuthEmail(input: string): boolean {
  return input.trim().includes('@')
}

export function parseCnAuthAccount(raw: string): ParsedCnAuthAccount {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new AuthLoginError('请输入手机号或邮箱')
  }

  if (isCnAuthEmail(trimmed)) {
    const email = trimmed.toLowerCase()
    if (!EMAIL_PATTERN.test(email)) {
      throw new AuthLoginError('请输入有效的邮箱地址')
    }
    return { channel: 'email', normalized: email, email }
  }

  const phone = normalizeCnPhone(trimmed)
  return { channel: 'phone', normalized: phone, phone }
}

export function maskCnAuthAccount(account: ParsedCnAuthAccount): string {
  if (account.channel === 'phone' && account.phone) {
    return maskPhone(account.phone)
  }

  const email = account.email ?? account.normalized
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`
  }
  return `${local.slice(0, 2)}***@${domain}`
}
