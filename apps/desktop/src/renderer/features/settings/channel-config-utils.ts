import type { ChannelPlatformId } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/useI18n'

export function hasWebhookUrl(platform: ChannelPlatformId): boolean {
  return platform === 'feishu' || platform === 'wechat'
}

export function getEnableDescription(
  platform: ChannelPlatformId,
  platformName: string,
  t: TranslateFn,
): string {
  const key = `settings.channels.enable.${platform}` as const
  const translated = t(key)
  if (translated !== key) return translated
  return t('settings.channels.enable.default', { platform: platformName })
}

export function getConnectionHint(platform: ChannelPlatformId, t: TranslateFn): string | null {
  const key = `settings.channels.hints.${platform}` as const
  const translated = t(key)
  if (translated !== key) return translated
  return t('settings.channels.hints.default')
}

export function getAppSecretLabel(platform: ChannelPlatformId, t: TranslateFn): string {
  switch (platform) {
    case 'discord':
      return t('settings.channels.credentials.appSecretDiscord')
    case 'dingtalk':
      return t('settings.channels.credentials.appSecretDingtalk')
    case 'wechat':
      return t('settings.channels.credentials.appSecretWechat')
    default:
      return t('settings.channels.credentials.appSecretDefault')
  }
}

export function getDomainPlaceholder(platform: ChannelPlatformId, t: TranslateFn): string {
  switch (platform) {
    case 'feishu':
      return t('settings.channels.modal.domainFeishu')
    case 'wechat':
      return t('settings.channels.modal.domainWechat')
    default:
      return t('settings.channels.modal.domainDefault')
  }
}
