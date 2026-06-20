import { AuthLoginError } from './auth-login.error.js'

const CN_MOBILE_PATTERN = /^1\d{10}$/

export function normalizeCnPhone(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, '')
  if (!trimmed) {
    throw new AuthLoginError('请输入手机号')
  }

  if (trimmed.startsWith('+')) {
    if (!/^\+86\d{11}$/.test(trimmed)) {
      throw new AuthLoginError('请输入有效的中国大陆手机号（+86）')
    }
    return trimmed
  }

  if (trimmed.startsWith('86') && trimmed.length === 13) {
    return `+${trimmed}`
  }

  if (CN_MOBILE_PATTERN.test(trimmed)) {
    return `+86${trimmed}`
  }

  throw new AuthLoginError('请输入有效的中国大陆手机号')
}

export function maskPhone(phone: string): string {
  const normalized = normalizeCnPhone(phone)
  return `${normalized.slice(0, 6)}****${normalized.slice(-4)}`
}
