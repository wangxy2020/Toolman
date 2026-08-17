/**
 * Personal mailbox hub selection for device-pairing P2P sync.
 * Never depends on official hub.toolman.app — only desktop Sync Hub URLs
 * the browser/app can actually reach (LAN / Tailscale / configured HTTPS).
 */
import { hostnameOfBaseUrl, isPrivateOrLoopbackHostname, type DevicePairingRecord } from '@toolman/shared'
import { Platform } from 'react-native'
import { createMobileSyncClient, getMobileSyncBaseUrl, rewriteSyncBaseUrlForClient } from './mobileSync-client'
import { isHostedWebPage } from './desktopDevHost'

/** True when the browser (or native app) can call this mailbox base URL. */
export function isBrowserSafeMailboxUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim()
  if (!trimmed) return false
  // Same-origin relative paths are not used for personal P2P (no official Hub proxy).
  if (trimmed.startsWith('/')) return false
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    // Native can use LAN HTTP. Hosted HTTPS pages cannot (mixed content).
    if (Platform.OS !== 'web') return isPrivateOrLoopbackHostname(url.hostname)
    if (isHostedWebPage()) return false
    return isPrivateOrLoopbackHostname(url.hostname)
  } catch {
    return false
  }
}

/**
 * Ordered mailbox bases for personal device sync (P2P / desktop Sync Hub only).
 */
export function listPersonalMailboxBaseUrls(
  pairing?: DevicePairingRecord | null,
): string[] {
  const out: string[] = []
  const add = (raw?: string | null) => {
    if (!raw?.trim()) return
    const rewritten = rewriteSyncBaseUrlForClient(raw.trim())
    if (!isBrowserSafeMailboxUrl(rewritten)) return
    if (!out.includes(rewritten)) out.push(rewritten)
  }

  for (const url of pairing?.reachableHubUrls ?? []) add(url)
  add(pairing?.hubBaseUrlHint)
  add(getMobileSyncBaseUrl())
  return out
}

export function createPersonalMailboxClient(baseUrl: string) {
  return createMobileSyncClient(baseUrl)
}

export function mailboxSeqKey(workspaceId: string, baseUrl: string): string {
  return `${workspaceId}::${baseUrl}`
}

export function describeMailboxBase(baseUrl: string): string {
  return hostnameOfBaseUrl(baseUrl) || baseUrl
}
