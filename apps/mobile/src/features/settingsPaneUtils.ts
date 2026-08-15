import { sanitizeApiKey } from '../chat/apiHeaders'

export function describeApiKey(raw: string): string {
  const key = sanitizeApiKey(raw)
  if (!key) return '未填写'
  const tail = key.length >= 4 ? key.slice(-4) : key
  const prefixOk = key.startsWith('sk-')
  return `长度 ${key.length} · 尾号 ****${tail}${prefixOk ? '' : ' · 警告：DeepSeek Key 通常以 sk- 开头'}`
}
