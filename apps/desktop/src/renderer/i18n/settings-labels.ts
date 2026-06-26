import type { ModelCategory, ModelTypeKey } from '../features/settings/provider-model-utils'
import type { ProviderPreset } from '../features/settings/provider-presets'
import {
  BUILTIN_SKILLS,
  CHANNEL_PLATFORMS,
  DEFAULT_MCP_SERVER_IDS,
  MCP_SERVER_IDS,
  type ChannelPlatformId,
} from '@toolman/shared'
import type { TranslateFn } from './I18nProvider'

const PRESET_MCP_SERVER_IDS = new Set<string>([
  ...(MCP_SERVER_IDS as readonly string[]),
  ...(DEFAULT_MCP_SERVER_IDS as readonly string[]),
])

export function getProviderPresetDisplayName(preset: ProviderPreset, t: TranslateFn): string {
  const key = `settings.providers.presets.${preset.id}` as const
  const translated = t(key)
  return translated === key ? preset.name : translated
}

export function getModelCategoryLabel(category: ModelCategory, t: TranslateFn): string {
  return t(`settings.models.categories.${category}`)
}

export function getModelTypeLabel(type: ModelTypeKey, t: TranslateFn): string {
  return t(`settings.models.types.${type}`)
}

export function getModelCapabilityLabel(type: ModelTypeKey | 'embedding' | 'rerank', t: TranslateFn): string {
  return t(`settings.models.capabilities.${type}`)
}

export function getMcpCategoryTitle(categoryId: string, t: TranslateFn): string {
  const key = `settings.mcp.categories.${categoryId}.title` as const
  const translated = t(key)
  return translated === key ? categoryId : translated
}

export function getMcpCategoryDescription(categoryId: string, t: TranslateFn): string {
  const key = `settings.mcp.categories.${categoryId}.description` as const
  const translated = t(key)
  return translated === key ? '' : translated
}

export function resolveMcpServerDescription(
  serverId: string,
  storedDescription: string | undefined,
  t: TranslateFn,
): string {
  const key = `settings.mcp.servers.descriptions.${serverId}` as const
  const translated = t(key)
  if (translated !== key && PRESET_MCP_SERVER_IDS.has(serverId)) {
    return translated
  }
  const trimmed = storedDescription?.trim()
  if (trimmed) return trimmed
  return translated !== key ? translated : ''
}

export function resolveSkillDescription(
  skill: { id: string; description: string },
  t: TranslateFn,
): string {
  const key = `settings.skills.descriptions.${skill.id}` as const
  const translated = t(key)
  const zhDefault = BUILTIN_SKILLS.find((item) => item.id === skill.id)?.description
  const trimmed = skill.description?.trim()
  if (translated !== key && (!trimmed || trimmed === zhDefault)) {
    return translated
  }
  return trimmed ?? (translated !== key ? translated : '')
}

export function getChannelStatusLabel(status: string, t: TranslateFn): string {
  const key = `settings.channels.status.${status}` as const
  const translated = t(key)
  if (translated !== key) return translated
  return t('settings.channels.status.disconnected')
}

export function getChannelPlatformLabel(platformId: ChannelPlatformId, t: TranslateFn): string {
  const key = `settings.channels.platforms.${platformId}` as const
  const translated = t(key)
  if (translated !== key) return translated
  return CHANNEL_PLATFORMS.find((item) => item.id === platformId)?.name ?? platformId
}

/** Map stored default names (from shared constants) to the current locale label. */
export function resolveChannelDisplayName(
  platformId: ChannelPlatformId,
  storedName: string,
  t: TranslateFn,
): string {
  const meta = CHANNEL_PLATFORMS.find((item) => item.id === platformId)
  const zhDefault = meta?.name ?? platformId
  const localized = getChannelPlatformLabel(platformId, t)
  if (storedName === zhDefault || storedName === platformId || storedName === localized) {
    return localized
  }
  return storedName
}

export function getAppUpdateButtonLabel(
  status: {
    phase?: string
    enabled?: boolean
    downloadProgress?: number | null
  } | null,
  t: TranslateFn,
): string {
  if (!status) return t('settings.about.update.check')
  switch (status.phase) {
    case 'checking':
      return t('settings.about.update.checking')
    case 'available':
      return t('settings.about.update.download')
    case 'downloading':
      return status.downloadProgress != null
        ? t('settings.about.update.downloadProgress', { progress: status.downloadProgress })
        : t('settings.about.update.downloading')
    case 'downloaded':
      return t('settings.about.update.restart')
    case 'not-available':
      return t('settings.about.update.notAvailable')
    case 'error':
      return t('settings.about.update.retry')
    default:
      return status.enabled ? t('settings.about.update.check') : t('settings.about.update.updateNow')
  }
}

export function getAppUpdateStatusHint(
  status: {
    phase?: string
    enabled?: boolean
    latestVersion?: string | null
    downloadProgress?: number | null
    error?: string | null
  } | null,
  t: TranslateFn,
): string | null {
  if (!status) return null

  if (!status.enabled) {
    return t('settings.about.autoUpdateDisabledHint')
  }

  if (status.error && status.phase === 'error') {
    return status.error
  }

  switch (status.phase) {
    case 'checking':
      return t('settings.about.updateStatus.checking')
    case 'available':
      return t('settings.about.updateStatus.available', {
        version: status.latestVersion ?? '',
      })
    case 'downloading':
      return status.downloadProgress != null
        ? t('settings.about.update.downloadProgress', { progress: status.downloadProgress })
        : t('settings.about.updateStatus.downloading')
    case 'downloaded':
      return t('settings.about.updateStatus.downloaded')
    case 'not-available':
      return t('settings.about.updateStatus.notAvailable')
    default:
      return null
  }
}
