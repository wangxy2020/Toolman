import { hasAnyCommunityHubCache } from '../community-hub-cache.service'
import {
  currentStatus,
  httpClient,
  setCurrentStatus,
} from './state'
import type { CommunityHubStatus } from './types'

export function getCommunityHubStatus(): CommunityHubStatus {
  return { ...currentStatus }
}

export function getCommunityHttpClient() {
  return httpClient
}

export function markCommunityHubOfflineReadOnly(error?: string): void {
  setCurrentStatus({
    ...currentStatus,
    running: httpClient != null,
    offlineReadOnly: hasAnyCommunityHubCache(),
    error: error ?? currentStatus.error ?? '官方 Hub 暂不可达，已切换为本地缓存只读',
  })
}

export function clearCommunityHubOfflineReadOnly(): void {
  if (!httpClient || !currentStatus.offlineReadOnly) return
  setCurrentStatus({
    ...currentStatus,
    running: true,
    offlineReadOnly: false,
    error: undefined,
  })
}
