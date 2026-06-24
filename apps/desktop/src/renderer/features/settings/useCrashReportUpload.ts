import { useCallback, useEffect, useState } from 'react'

import {
  CrashReportUploadResultSchema,
  CrashReportUploadStatusSchema,
  IpcChannel,
  type CrashReportUploadResult,
  type CrashReportUploadStatus,
} from '@toolman/shared'

export function useCrashReportUpload() {
  const [status, setStatus] = useState<CrashReportUploadStatus | null>(null)
  const [uploading, setUploading] = useState(false)

  const refresh = useCallback(async () => {
    const result = await window.api.invoke(IpcChannel.AppCrashReportGetStatus, {})
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    setStatus(CrashReportUploadStatusSchema.parse(result.data))
  }, [])

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  const setUploadEnabled = useCallback(
    async (uploadEnabled: boolean) => {
      const result = await window.api.invoke(IpcChannel.AppCrashReportSetUpload, { uploadEnabled })
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      setStatus(CrashReportUploadStatusSchema.parse(result.data))
    },
    [],
  )

  const uploadNow = useCallback(async (): Promise<CrashReportUploadResult> => {
    setUploading(true)
    try {
      const result = await window.api.invoke(IpcChannel.AppCrashReportUploadNow, {})
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      const parsed = CrashReportUploadResultSchema.parse(result.data)
      await refresh()
      return parsed
    } finally {
      setUploading(false)
    }
  }, [refresh])

  return {
    status,
    uploading,
    refresh,
    setUploadEnabled,
    uploadNow,
  }
}
