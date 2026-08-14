import type { AuthAccountKind, AuthRegion } from './types'

export type ParsedAccountInput =
  | {
      ok: true
      accountKey: string
      accountKind: AuthAccountKind
      email: string
      phone: string | null
    }
  | { ok: false; message: string }

/** Parse email or Chinese mobile number as login/register identifier. */
export function parseAccountInput(raw: string, region: AuthRegion): ParsedAccountInput {
  const value = raw.trim()
  if (!value) {
    return {
      ok: false,
      message: region === 'cn' ? '请输入手机号或邮箱' : '请输入邮箱',
    }
  }
  if (value.includes('@')) {
    const email = value.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: '请输入有效邮箱' }
    }
    return { ok: true, accountKey: email, accountKind: 'email', email, phone: null }
  }
  const digits = value.replace(/\s+/g, '').replace(/^\+86/, '')
  if (region === 'intl') {
    return { ok: false, message: '国际区请使用邮箱登录' }
  }
  if (!/^1\d{10}$/.test(digits)) {
    return { ok: false, message: '请输入有效的 11 位手机号' }
  }
  return { ok: true, accountKey: digits, accountKind: 'phone', email: '', phone: digits }
}

export function isCnEmailAccountInput(value: string): boolean {
  return value.trim().includes('@')
}

export function cnPrimaryActionLabel(view: 'login' | 'register', account: string): string {
  if (view === 'register') {
    return isCnEmailAccountInput(account) ? '邮箱注册' : '手机号注册'
  }
  return isCnEmailAccountInput(account) ? '邮箱登录' : '手机号登录'
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return phone
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}
