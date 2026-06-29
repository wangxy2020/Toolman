import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type AppGetDiagnosticsOutput } from '@toolman/shared'
import { recordProvenanceBeacon } from '../../lib/record-provenance-beacon'
import { useCrashReportUpload } from './useCrashReportUpload'

export function useDiagnosticsSettings() {
  const [snapshot, setSnapshot] = useState<AppGetDiagnosticsOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yjsToggling, setYjsToggling] = useState(false)
  const [cidToggling, setCidToggling] = useState(false)
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
    const result = await window.api.invoke(IpcChannel.AppGetDiagnostics)
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setSnapshot(result.data as AppGetDiagnosticsOutput)
    setError(null)
    await refreshCrashUploadStatus().catch(() => undefined)
  }, [refreshCrashUploadStatus])

  useEffect(() => {
    void refresh()
    recordProvenanceBeacon('app.diagnostics.view')
  }, [refresh])

  const setCommunityYjsEnabled = async (enabled: boolean) => {
    setYjsToggling(true)
    setToggleError(null)
    const result = await window.api.invoke(IpcChannel.CommunityYjsSetEnabled, { enabled })
    setYjsToggling(false)
    if (!result.ok) {
      setToggleError(result.error.message)
      return
    }
    await refresh()
  }

  const setCommunityCidEnabled = async (enabled: boolean) => {
    setCidToggling(true)
    setToggleError(null)
    const result = await window.api.invoke(IpcChannel.CommunityCidSetEnabled, { enabled })
    setCidToggling(false)
    if (!result.ok) {
      setToggleError(result.error.message)
      return
    }
    await refresh()
  }

  const restartLibp2pNetwork = async () => {
    setRestartingLibp2p(true)
    setToggleError(null)
    const result = await window.api.invoke(IpcChannel.P2pNetworkRestartLibp2p)
    setRestartingLibp2p(false)
    if (!result.ok) {
      setToggleError(result.error.message)
      return
    }
    await refresh()
  }

  return {
    snapshot,
    loading,
    error,
    yjsToggling,
    cidToggling,
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
    restartLibp2pNetwork,
  }
}
