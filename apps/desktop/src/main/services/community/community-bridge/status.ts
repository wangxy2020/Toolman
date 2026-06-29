import { hasAnyCommunityHubCache } from '../community-hub-cache.service'
import {
  childProcess,
  currentStatus,
  httpClient,
  setCurrentStatus,
} from './state'
import type { CommunityHubStatus } from './types'

export function getCommunityHubStatus(): CommunityHubStatus {
  return { ...currentStatus }
}

export function getCommunityHubBaseUrl(): string | null {
  return currentStatus.baseUrl
}

export function isCommunityHubRunning(): boolean {
  return currentStatus.running
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

export function isOwnedChildProcess(pid: number): boolean {
  return childProcess?.pid === pid
}
