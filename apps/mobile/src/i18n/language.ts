export type AppLanguage = 'zh-CN' | 'en'

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'zh-CN' || value === 'en'
}
