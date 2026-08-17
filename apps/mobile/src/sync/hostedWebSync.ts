import { isHostedWebPage } from './desktopDevHost'

export const HOSTED_WEB_SYNC_MESSAGE =
  '托管网页无法直连电脑上的 HTTP Sync Hub。请先完成设备配对，双方在线时走 WebRTC（信令经投递盒 / 可达桌面）。不会配 TURN、只要网页能同步时，再填写 HTTPS 桌面地址作为兜底。不依赖官方 Hub。'

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
