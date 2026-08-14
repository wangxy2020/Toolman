/**
 * Desktop ↔ mobile sync adapter (feature-flagged via settings and/or env).
 */
import type { SyncChange, SyncPushOutput } from '@toolman/shared'
import {
  isMobileSyncPreferenceEnabled,
  readMobileSyncPreferences,
  writeMobileSyncPreferences,
} from './mobile-sync.config'
import { appendSyncChanges } from './mobile-sync-store'

export function isMobileSyncEnabled(): boolean {
  return isMobileSyncPreferenceEnabled()
}

export async function pushDesktopSyncChanges(
  changes: SyncChange[],
): Promise<SyncPushOutput | null> {
  if (!isMobileSyncEnabled()) return null
  const result = appendSyncChanges(changes)
  return {
    accepted: result.accepted,
    rejected: [],
    serverTime: Date.now(),
  }
}

export function setMobileSyncPreferenceEnabled(enabled: boolean) {
  const current = readMobileSyncPreferences()
  return writeMobileSyncPreferences({
    ...current,
    syncEnabled: enabled,
    // Turning sync off also clears agent-host until re-enabled.
    agentHostEnabled: enabled ? current.agentHostEnabled : false,
  })
}
