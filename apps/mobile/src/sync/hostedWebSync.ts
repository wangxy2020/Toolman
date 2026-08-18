import { isHostedWebPage } from './desktopDevHost'

export const HOSTED_WEB_SYNC_MESSAGE =
  '本机已启动桌面端时可直接同步。若浏览器弹出本地网络权限，请选择允许。若仍失败，请确认桌面端已打开，或填写 4 位配对码。'

export function isHttpsSyncUrl(raw?: string | null): boolean {
  return Boolean(raw && /^https:\/\//i.test(raw.trim()))
}

/**
 * Soft guidance for hosted web. Same-computer loopback is probed automatically;
 * do not treat hosted web as unable to reach HTTP Sync Hub.
 */
export function hostedWebSyncSoftHint(options?: {
  configuredSyncBaseUrl?: string | null
  envSyncBaseUrl?: string | null
}): string | null {
  if (!isHostedWebPage()) return null
  if (isHttpsSyncUrl(options?.configuredSyncBaseUrl) || isHttpsSyncUrl(options?.envSyncBaseUrl)) {
    return null
  }
  return null
}

/** @deprecated Prefer soft hint; hosted web no longer hard-blocks sync attempts. */
export function hostedWebSyncBlockedReason(options?: {
  configuredSyncBaseUrl?: string | null
  envSyncBaseUrl?: string | null
}): string | null {
  void options
  return null
}
