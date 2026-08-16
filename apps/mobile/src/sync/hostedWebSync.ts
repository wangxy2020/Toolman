import { isHostedWebPage } from './desktopDevHost'

export const HOSTED_WEB_SYNC_MESSAGE =
  '托管网页无法访问电脑上的 HTTP Sync Hub。请完成设备配对后走点到点 / 加密投递；真机局域网仍可用配对令牌。官方社区 Hub 明文镜像为可选，未部署不影响局域网与点到点同步。'

export function isHttpsSyncUrl(raw?: string | null): boolean {
  return Boolean(raw && /^https:\/\//i.test(raw.trim()))
}

/**
 * Soft guidance for hosted web (subtitle / diagnostics). Never hard-blocks sync —
 * pairing + WebRTC / personal mailbox / optional Hub proxy may still succeed.
 */
export function hostedWebSyncSoftHint(options?: {
  configuredSyncBaseUrl?: string | null
  envSyncBaseUrl?: string | null
}): string | null {
  if (!isHostedWebPage()) return null
  if (isHttpsSyncUrl(options?.configuredSyncBaseUrl) || isHttpsSyncUrl(options?.envSyncBaseUrl)) {
    return null
  }
  return HOSTED_WEB_SYNC_MESSAGE
}

/** @deprecated Prefer soft hint; hosted web no longer hard-blocks sync attempts. */
export function hostedWebSyncBlockedReason(options?: {
  configuredSyncBaseUrl?: string | null
  envSyncBaseUrl?: string | null
}): string | null {
  void options
  return null
}
