import type { AppLanguage } from '../features/settings/app-settings'
import { en } from './locales/en'
import { zhCN } from './locales/zh-CN'

type MessageDict = Record<string, string>

function flattenMessages(input: Record<string, unknown>, prefix = ''): MessageDict {
  const out: MessageDict = {}
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out[path] = value
    } else if (value && typeof value === 'object') {
      Object.assign(out, flattenMessages(value as Record<string, unknown>, path))
    }
  }
  return out
}

const MESSAGES: Record<AppLanguage, MessageDict> = {
  'zh-CN': flattenMessages(zhCN as unknown as Record<string, unknown>),
  en: flattenMessages(en as unknown as Record<string, unknown>),
}

export type TranslateParams = Record<string, string | number>

export function translate(
  language: AppLanguage,
  key: string,
  params?: TranslateParams,
): string {
  const template = MESSAGES[language][key] ?? MESSAGES['zh-CN'][key] ?? key
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = params[name]
    return value == null ? '' : String(value)
  })
}
