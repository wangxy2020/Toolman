/**
 * Desktop ↔ mobile sync adapter (feature-flagged via settings and/or env).
 */
import { app } from 'electron'
import type { SyncChange, SyncPullOutput, SyncPushOutput } from '@toolman/shared'
import {
  isMobileSyncPreferenceEnabled,
  readMobileSyncPreferences,
  writeMobileSyncPreferences,
} from './mobile-sync.config'
import { appendSyncChanges, pullSyncChanges } from './mobile-sync-store'

export function isMobileSyncEnabled(): boolean {
  return isMobileSyncPreferenceEnabled()
}

export type DesktopSyncState = {
  cursor: string | null
  lastPushAt: number | null
  lastPullAt: number | null
  lastError: string | null
}

const state: DesktopSyncState = {
  cursor: null,
  lastPushAt: null,
  lastPullAt: null,
  lastError: null,
}

export function getDesktopMobileSyncState(): DesktopSyncState {
  return { ...state }
}

export async function pushDesktopSyncChanges(
  changes: SyncChange[],
): Promise<SyncPushOutput | null> {
  if (!isMobileSyncEnabled()) return null
  try {
    const result = appendSyncChanges(changes)
    state.lastPushAt = Date.now()
    state.lastError = null
    return {
      accepted: result.accepted,
      rejected: [],
      serverTime: Date.now(),
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error)
    throw error
  }
}

export async function pullDesktopSyncChanges(limit = 100): Promise<SyncPullOutput | null> {
  if (!isMobileSyncEnabled()) return null
  try {
    const pulled = pullSyncChanges({ cursor: state.cursor, limit })
    state.cursor = pulled.nextCursor
    state.lastPullAt = Date.now()
    state.lastError = null
    return {
      changes: pulled.changes,
      nextCursor: pulled.nextCursor,
      serverTime: Date.now(),
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error)
    throw error
  }
}

export function getDesktopSyncDeviceId(): string {
  return `desktop-${app.getName()}-${process.platform}`
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
