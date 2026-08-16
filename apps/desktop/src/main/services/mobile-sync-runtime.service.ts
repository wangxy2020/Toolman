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
import {
  changelogHasEntityKind,
  isMobileSyncChangelogEmpty,
  publishNoteSyncChange,
  setSyncChangeAppendListener,
} from './mobile-sync-store'
import { seedClassroomSessionSyncChanges } from './classroom-mobile-sync'
import { seedP2pGroupSyncChanges } from './group-mobile-sync'
import {
  replicateChangesToCommunityHub,
  startCommunityDeviceSyncLoop,
  stopCommunityDeviceSyncLoop,
} from './community-device-sync'
import {
  ensureMobileSyncHubToken,
  isClassroomSyncPreferenceEnabled,
  isMobileSyncLanAccessEnabled,
  isMobileSyncWanEnabled,
  setClassroomSyncPreferenceEnabled,
  setMobileSyncLanAccessEnabled,
  setMobileSyncWanEnabled,
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
    const empty = isMobileSyncChangelogEmpty()
    if (empty) {
      for (const note of getNotesData().notes) {
        publishNoteSyncChange({
          id: note.id,
          title: note.title,
          content: note.content,
          updatedAt: note.updatedAt,
        })
      }
    }
    publishActiveKnowledgeMeta()
    if (empty || !changelogHasEntityKind('classroom_session')) {
      seedClassroomSessionSyncChanges()
    }
    if (empty || !changelogHasEntityKind('p2p_group')) {
      seedP2pGroupSyncChanges()
    }
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
  const lanAccessEnabled = isMobileSyncLanAccessEnabled()
  return {
    syncEnabled: isMobileSyncEnabled(),
    agentHostEnabled: isMobileAgentHostEnabled(),
    classroomSyncEnabled: isClassroomSyncPreferenceEnabled(),
    hubRunning: Boolean(getMobileSyncHubBaseUrl()),
    hubBaseUrl: getMobileSyncHubBaseUrl(),
    advertisedUrls: lanAccessEnabled
      ? advertisedHttpUrls(syncPort)
      : [`http://127.0.0.1:${syncPort}`],
    lastError: null,
    hubToken: ensureMobileSyncHubToken(),
    lanAccessEnabled,
    wanSyncEnabled: isMobileSyncWanEnabled(),
  }
}

export async function ensureMobileSyncRuntime(): Promise<AppDiagnosticsMobileSync> {
  if (!isMobileSyncEnabled()) {
    stopCommunityDeviceSyncLoop()
    setSyncChangeAppendListener(null)
    await stopMobileSyncHub()
    return getMobileSyncDiagnostics()
  }
  seedMobileSyncChangelog()
  setSyncChangeAppendListener(replicateChangesToCommunityHub)
  if (isMobileSyncWanEnabled()) {
    startCommunityDeviceSyncLoop()
  } else {
    stopCommunityDeviceSyncLoop()
  }
  try {
    await startMobileSyncHub()
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    logStructured('mobile-sync', 'warn', `hub start failed: ${message}`)
    return { ...getMobileSyncDiagnostics(), lastError: message }
  }
  return getMobileSyncDiagnostics()
}

export async function setMobileSyncEnabled(
  enabled: boolean,
  extras?: { lanAccessEnabled?: boolean; wanSyncEnabled?: boolean },
): Promise<AppDiagnosticsMobileSync> {
  if (typeof extras?.lanAccessEnabled === 'boolean') {
    setMobileSyncLanAccessEnabled(extras.lanAccessEnabled)
  }
  if (typeof extras?.wanSyncEnabled === 'boolean') {
    setMobileSyncWanEnabled(extras.wanSyncEnabled)
  }
  setMobileSyncPreferenceEnabled(enabled)
  if (!enabled) {
    stopCommunityDeviceSyncLoop()
    setSyncChangeAppendListener(null)
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
