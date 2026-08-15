import { useEffect } from 'react'
import { IpcChannel, type AppGetDiagnosticsOutput } from '@toolman/shared'
import { safeInvoke } from '../../lib/ipc-client'

export type MobileSyncPublishScope = 'notes' | 'knowledge' | 'classroom'

/**
 * When a notes / knowledge / classroom page is open, republish the latest
 * local data onto the Sync Hub so a connected phone can pull automatically.
 * Does not force-enable the hub if the user turned it off.
 */
export function useAutoPublishMobileSync(scope: MobileSyncPublishScope): void {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await safeInvoke(IpcChannel.AppGetDiagnostics)
      if (!result.ok || cancelled) return
      const mobile = (result.data as AppGetDiagnosticsOutput).mobileSync
      if (!mobile?.syncEnabled) return
      await safeInvoke(IpcChannel.MobileSyncSetEnabled, { enabled: true })
      if (cancelled) return
      if (scope === 'classroom') {
        await safeInvoke(IpcChannel.ClassroomSyncSetEnabled, { enabled: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scope])
}
