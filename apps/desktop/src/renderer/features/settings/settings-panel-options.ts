import type { TranslateFn } from '../../i18n/useI18n'
import type { AppLanguage } from './app-settings'

export function buildLanguageOptions(
  t: TranslateFn,
): { value: AppLanguage; label: string }[] {
  return [
    { value: 'zh-CN', label: t('language.zhCN') },
    { value: 'en', label: t('language.en') },
  ]
}

export function buildShortcutRows(t: TranslateFn): { keys: string; action: string }[] {
  return [
    { keys: '⌘ + N', action: t('settings.shortcuts.newSession') },
    { keys: '⌘ + K', action: t('settings.shortcuts.openSearch') },
    { keys: '⌘ + ,', action: t('settings.shortcuts.openSettings') },
    { keys: '⌘ + Enter', action: t('settings.shortcuts.sendMessage') },
    { keys: 'Esc', action: t('settings.shortcuts.closeOrCancel') },
  ]
}
