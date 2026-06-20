export function redactPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 4) return '****'
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}

export function redactEmail(value: string): string {
  const trimmed = value.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '***@***'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const maskedLocal = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***`
  return `${maskedLocal}@${domain}`
}

export function redactSecret(value: string, visiblePrefix = 0, visibleSuffix = 0): string {
  if (!value) return ''
  if (value.length <= visiblePrefix + visibleSuffix) return '*'.repeat(value.length)
  return `${value.slice(0, visiblePrefix)}***${value.slice(-visibleSuffix)}`
}

export function formatAuthDevSmsLog(phone: string, code: string): string {
  return `[auth:sms-dev] ${redactPhone(phone)} -> ${redactSecret(code, 0, 2)}`
}
