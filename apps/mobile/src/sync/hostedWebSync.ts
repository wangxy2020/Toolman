import { OFFICIAL_TOOLMAN_HUB_URL } from '@toolman/shared'
import { isHostedWebPage } from './desktopDevHost'

export const HOSTED_WEB_SYNC_MESSAGE =
  '托管网页无法访问电脑上的 HTTP Sync Hub。同一局域网请用真机；跨网将走官方社区 Hub（需登录同一账号）。'

export function isHttpsSyncUrl(raw?: string | null): boolean {
  return Boolean(raw && /^https:\/\//i.test(raw.trim()))
}

export function hostedWebSyncBlockedReason(options?: {
  configuredSyncBaseUrl?: string | null
  envSyncBaseUrl?: string | null
}): string | null {
  if (!isHostedWebPage()) return null
  if (isHttpsSyncUrl(options?.configuredSyncBaseUrl) || isHttpsSyncUrl(options?.envSyncBaseUrl)) {
    return null
  }
  // Official community hub is HTTPS and can relay private sync when LAN is unreachable.
  if (isHttpsSyncUrl(OFFICIAL_TOOLMAN_HUB_URL)) return null
  return HOSTED_WEB_SYNC_MESSAGE
}
