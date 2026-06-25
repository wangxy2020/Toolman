import type { AppLanguage } from '../features/settings/app-settings'

export function getDateLocale(language: AppLanguage): string {
  return language === 'en' ? 'en-US' : 'zh-CN'
}
