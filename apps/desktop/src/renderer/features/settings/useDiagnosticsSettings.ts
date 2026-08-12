import { useCallback, useEffect, useState } from 'react'
import {
  IpcChannel,
  type AppDiagnosticsMobileSync,
  type AppGetDiagnosticsOutput,
} from '@toolman/shared'
import { recordProvenanceBeacon } from '../../lib/record-provenance-beacon'
import { useCrashReportUpload } from './useCrashReportUpload'

const EMPTY_MOBILE_SYNC: AppDiagnosticsMobileSync = {
  syncEnabled: false,
  agentHostEnabled: false,
  hubRunning: false,
  hubBaseUrl: null,
  lastError: null,
}

function normalizeSnapshot(raw: AppGetDiagnosticsOutput): AppGetDiagnosticsOutput {
  return {
    ...raw,
    mobileSync: raw.mobileSync ?? EMPTY_MOBILE_SYNC,
  }
}

function formatInvokeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/No handler registered/i.test(message)) {
    return `${fallback}（请完全重启桌面端后再试）`
  }
  return message || fallback
}

export function useDiagnosticsSettings() {
  const [snapshot, setSnapshot] = useState<AppGetDiagnosticsOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yjsToggling, setYjsToggling] = useState(false)
  const [cidToggling, setCidToggling] = useState(false)
  const [mobileSyncToggling, setMobileSyncToggling] = useState(false)
  const [mobileHostToggling, setMobileHostToggling] = useState(false)
  const [restartingLibp2p, setRestartingLibp2p] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const {
    status: crashUploadStatus,
    uploading: crashUploading,
    setUploadEnabled: setCrashUploadEnabled,
    uploadNow: uploadCrashReportsNow,
    refresh: refreshCrashUploadStatus,
  } = useCrashReportUpload()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.invoke(IpcChannel.AppGetDiagnostics)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setSnapshot(normalizeSnapshot(result.data as AppGetDiagnosticsOutput))
      setError(null)
      await refreshCrashUploadStatus().catch(() => undefined)
    } catch (err) {
      setError(formatInvokeError(err, 'Failed to load diagnostics'))
    } finally {
      setLoading(false)
    }
  }, [refreshCrashUploadStatus])

  useEffect(() => {
    void refresh()
    recordProvenanceBeacon('app.diagnostics.view')
  }, [refresh])

  const patchMobileSync = (mobileSync: AppDiagnosticsMobileSync) => {
    setSnapshot((prev) => (prev ? { ...prev, mobileSync } : prev))
  }

  const setCommunityYjsEnabled = async (enabled: boolean) => {
    setYjsToggling(true)
    setToggleError(null)
    try {
      const result = await window.api.invoke(IpcChannel.CommunityYjsSetEnabled, { enabled })
      if (!result.ok) {
        setToggleError(result.error.message)
        return
      }
      await refresh()
    } catch (err) {
      setToggleError(formatInvokeError(err, 'Failed to update Yjs'))
    } finally {
      setYjsToggling(false)
    }
  }

  const setCommunityCidEnabled = async (enabled: boolean) => {
    setCidToggling(true)
    setToggleError(null)
    try {
      const result = await window.api.invoke(IpcChannel.CommunityCidSetEnabled, { enabled })
      if (!result.ok) {
        setToggleError(result.error.message)
        return
      }
      await refresh()
    } catch (err) {
      setToggleError(formatInvokeError(err, 'Failed to update CID'))
    } finally {
      setCidToggling(false)
    }
  }

  const setMobileSyncEnabled = async (enabled: boolean) => {
    setMobileSyncToggling(true)
    setToggleError(null)
    try {
      const result = await window.api.invoke(IpcChannel.MobileSyncSetEnabled, { enabled })
      if (!result.ok) {
        setToggleError(result.error.message)
        return
      }
      patchMobileSync(result.data as AppDiagnosticsMobileSync)
      await refresh()
    } catch (err) {
      setToggleError(formatInvokeError(err, '无法更新移动端同步'))
    } finally {
      setMobileSyncToggling(false)
    }
  }

  const setMobileAgentHostEnabled = async (enabled: boolean) => {
    setMobileHostToggling(true)
    setToggleError(null)
    try {
      const result = await window.api.invoke(IpcChannel.MobileAgentHostSetEnabled, { enabled })
      if (!result.ok) {
        setToggleError(result.error.message)
        return
      }
      patchMobileSync(result.data as AppDiagnosticsMobileSync)
      await refresh()
    } catch (err) {
      setToggleError(formatInvokeError(err, '无法更新桌面宿主'))
    } finally {
      setMobileHostToggling(false)
    }
  }

  const restartLibp2pNetwork = async () => {
    setRestartingLibp2p(true)
    setToggleError(null)
    try {
      const result = await window.api.invoke(IpcChannel.P2pNetworkRestartLibp2p)
      if (!result.ok) {
        setToggleError(result.error.message)
        return
      }
      await refresh()
    } catch (err) {
      setToggleError(formatInvokeError(err, 'Failed to restart libp2p'))
    } finally {
      setRestartingLibp2p(false)
    }
  }

  return {
    snapshot,
    loading,
    error,
    yjsToggling,
    cidToggling,
    mobileSyncToggling,
    mobileHostToggling,
    restartingLibp2p,
    toggleError,
    setToggleError,
    crashUploadStatus,
    crashUploading,
    setCrashUploadEnabled,
    uploadCrashReportsNow,
    refresh,
    setCommunityYjsEnabled,
    setCommunityCidEnabled,
    setMobileSyncEnabled,
    setMobileAgentHostEnabled,
    restartLibp2pNetwork,
  }
}
