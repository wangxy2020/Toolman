/**
 * Start/stop local Sync Hub and seed changelog when preferences change.
 */
import type { AppDiagnosticsMobileSync } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import {
  configureMobileAgentHost,
  isMobileAgentHostEnabled,
  publishActiveKnowledgeMeta,
  setMobileAgentHostPreferenceEnabled,
} from './mobile-agent-host.service'
import {
  isMobileSyncEnabled,
  setMobileSyncPreferenceEnabled,
} from './mobile-sync.service'
import {
  getMobileSyncHubBaseUrl,
  getMobileSyncHubPort,
  startMobileSyncHub,
  stopMobileSyncHub,
} from './mobile-sync-hub'
import { getNotesData } from './notes-data/storage'
import { publishNoteSyncChange } from './mobile-sync-store'
import { seedClassroomSessionSyncChanges } from './classroom-mobile-sync'
import {
  isClassroomSyncPreferenceEnabled,
  setClassroomSyncPreferenceEnabled,
} from './mobile-sync.config'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { logStructured } from './structured-log.service'
import { advertisedHttpUrls } from './network-advertise'

function seedMobileSyncChangelog(): void {
  try {
    const device = getP2pDeviceInfo()
    configureMobileAgentHost({
      identityId: device.identityId,
      deviceId: device.deviceId,
    })
    for (const note of getNotesData().notes) {
      publishNoteSyncChange({
        id: note.id,
        title: note.title,
        content: note.content,
        updatedAt: note.updatedAt,
      })
    }
    publishActiveKnowledgeMeta()
    seedClassroomSessionSyncChanges()
  } catch (error) {
    logStructured(
      'mobile-sync',
      'warn',
      `seed changelog failed: ${toErrorMessage(error, String(error))}`,
    )
  }
}

export function getMobileSyncDiagnostics(): AppDiagnosticsMobileSync {
  const syncPort = getMobileSyncHubPort()
  return {
    syncEnabled: isMobileSyncEnabled(),
    agentHostEnabled: isMobileAgentHostEnabled(),
    classroomSyncEnabled: isClassroomSyncPreferenceEnabled(),
    hubRunning: Boolean(getMobileSyncHubBaseUrl()),
    hubBaseUrl: getMobileSyncHubBaseUrl(),
    advertisedUrls: advertisedHttpUrls(syncPort),
    lastError: null,
  }
}

export async function ensureMobileSyncRuntime(): Promise<AppDiagnosticsMobileSync> {
  if (!isMobileSyncEnabled()) {
    await stopMobileSyncHub()
    return getMobileSyncDiagnostics()
  }
  seedMobileSyncChangelog()
  try {
    await startMobileSyncHub()
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    logStructured('mobile-sync', 'warn', `hub start failed: ${message}`)
    return { ...getMobileSyncDiagnostics(), lastError: message }
  }
  return getMobileSyncDiagnostics()
}

export async function setMobileSyncEnabled(enabled: boolean): Promise<AppDiagnosticsMobileSync> {
  setMobileSyncPreferenceEnabled(enabled)
  if (!enabled) {
    await stopMobileSyncHub()
    return getMobileSyncDiagnostics()
  }
  return ensureMobileSyncRuntime()
}

export async function setMobileAgentHostEnabled(
  enabled: boolean,
): Promise<AppDiagnosticsMobileSync> {
  setMobileAgentHostPreferenceEnabled(enabled)
  return ensureMobileSyncRuntime()
}

export async function setClassroomSyncEnabled(
  enabled: boolean,
): Promise<AppDiagnosticsMobileSync> {
  setClassroomSyncPreferenceEnabled(enabled)
  if (enabled) {
    return setMobileSyncEnabled(true)
  }
  return getMobileSyncDiagnostics()
}
