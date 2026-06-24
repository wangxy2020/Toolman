import { app } from 'electron'
import {
  AppUpdateChannelSchema,
  buildAutoUpdaterFeedUrl,
  buildUpdateManifestUrl,
  type AppUpdateChannel,
} from '@toolman/shared'
import { getBakedUpdateChannel, getBakedUpdateFeedUrl } from '../config/release-update'

export interface AppUpdateConfig {
  channel: AppUpdateChannel
  feedBaseUrl: string
  manifestUrl: string
  autoUpdaterFeedUrl: string
  /** Packaged build with a configured remote feed. */
  enabled: boolean
}

function resolveUpdateChannel(): AppUpdateChannel {
  const raw =
    process.env.TOOLMAN_UPDATE_CHANNEL?.trim().toLowerCase() ||
    getBakedUpdateChannel().trim().toLowerCase()
  const parsed = AppUpdateChannelSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'stable'
}

export function getAppUpdateConfig(): AppUpdateConfig {
  const channel = resolveUpdateChannel()
  const feedBaseUrl =
    process.env.TOOLMAN_UPDATE_FEED_URL?.trim() || getBakedUpdateFeedUrl().trim()
  const platform = process.platform as 'darwin' | 'win32' | 'linux'
  const manifestUrl = feedBaseUrl ? buildUpdateManifestUrl(feedBaseUrl, channel) : ''
  const autoUpdaterFeedUrl = feedBaseUrl
    ? buildAutoUpdaterFeedUrl(feedBaseUrl, channel, platform, process.arch)
    : ''
  const enabled = Boolean(app?.isPackaged) && feedBaseUrl.length > 0

  return {
    channel,
    feedBaseUrl,
    manifestUrl,
    autoUpdaterFeedUrl,
    enabled,
  }
}
