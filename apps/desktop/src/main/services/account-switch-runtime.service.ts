/**
 * Quiesce and rebind main-process services when the active login account changes.
 */
import { toErrorMessage } from '@toolman/shared'
import { getActiveWorkspaceId } from './account-scope.service'
import { stopAllKnowledgeWatchers, bootstrapKnowledgeWatchers } from './knowledge-watcher.service'
import { rebindMobileSyncStoreForAccount } from './mobile-sync-store'
import { ensureMobileSyncRuntime } from './mobile-sync-runtime.service'
import {
  rebindWanCursorForAccount,
  stopCommunityDeviceSyncLoop,
} from './community-device-sync'
import { stopPersonalDeviceWebrtcLoop } from './personal-device-webrtc.service'
import { setSyncChangeAppendListener } from './mobile-sync-store'
import { stopMobileSyncHub } from './mobile-sync-hub'
import { invalidateMcpServerCache } from './mcp-server-config/persistence'
import { bootstrapTaskWorkerForWorkspace } from './task-runtime/bootstrap'
import { logStructured } from './structured-log.service'

export function quiesceAccountScopedServices(): void {
  try {
    stopAllKnowledgeWatchers()
  } catch (error) {
    logStructured('auth', 'warn', `stop watchers failed: ${toErrorMessage(error, String(error))}`)
  }
  try {
    stopCommunityDeviceSyncLoop()
  } catch {
    // optional
  }
  try {
    stopPersonalDeviceWebrtcLoop()
  } catch {
    // optional
  }
  try {
    setSyncChangeAppendListener(null)
  } catch {
    // optional
  }
  void stopMobileSyncHub().catch((error) => {
    logStructured('auth', 'warn', `stop sync hub failed: ${toErrorMessage(error, String(error))}`)
  })
}

export function rebindAccountScopedServices(): void {
  rebindMobileSyncStoreForAccount()
  rebindWanCursorForAccount()
  try {
    invalidateMcpServerCache()
  } catch {
    // optional
  }
  try {
    bootstrapKnowledgeWatchers()
  } catch (error) {
    logStructured(
      'auth',
      'warn',
      `rebind knowledge watchers failed: ${toErrorMessage(error, String(error))}`,
    )
  }
  const workspaceId = getActiveWorkspaceId()
  if (workspaceId) {
    try {
      bootstrapTaskWorkerForWorkspace(workspaceId)
    } catch (error) {
      logStructured(
        'auth',
        'warn',
        `rebind task worker failed: ${toErrorMessage(error, String(error))}`,
      )
    }
  }
  void ensureMobileSyncRuntime().catch((error) => {
    logStructured(
      'auth',
      'warn',
      `rebind mobile sync failed: ${toErrorMessage(error, String(error))}`,
    )
  })
}
