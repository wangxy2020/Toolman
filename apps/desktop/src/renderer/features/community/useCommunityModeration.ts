import { useCallback, useEffect, useState } from 'react'

import {
  type CommunityModerationLog,
  type CommunityModerationReportResolveInput,
  type CommunityModerationScanOutput,
} from '@toolman/shared'

import {
  approveCommunityModerationResource,
  banCommunityModerationUser,
  cancelCommunityTask,
  deleteCommunityBoardMessage,
  listCommunityModerationLogs,
  resolveCommunityModerationReport,
  scanCommunityModerationOnline,
  suspendCommunityModerationResource,
  touchCommunityPresenceHeartbeat,
} from './community-api.client'
import { notifyCommunityBoardChanged } from './community-events'
import { isCommunitySessionActive } from '../user/community-session'

const AUTO_SCAN_INTERVAL_MS = 60_000

export function useCommunityModeration(options: { autoScan?: boolean; enabled?: boolean } = {}) {
  const { autoScan = true, enabled = true } = options
  const [scan, setScan] = useState<CommunityModerationScanOutput | null>(null)
  const [logs, setLogs] = useState<CommunityModerationLog[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setScan(null)
      setLogs([])
      setError(null)
      setScanError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (isCommunitySessionActive()) {
        await touchCommunityPresenceHeartbeat().catch(() => undefined)
      }

      const [scanResult, logsResult] = await Promise.allSettled([
        scanCommunityModerationOnline(),
        listCommunityModerationLogs({ limit: 50 }),
      ])

      if (scanResult.status === 'fulfilled') {
        setScan(scanResult.value)
        setScanError(null)
      } else {
        setScan(null)
        const message =
          scanResult.reason instanceof Error
            ? scanResult.reason.message
            : '扫描在线内容失败，请确认 Community Hub 已更新并重启'
        setScanError(message)
      }

      if (logsResult.status === 'fulfilled') {
        setLogs(logsResult.value.items)
      } else {
        const message =
          logsResult.reason instanceof Error ? logsResult.reason.message : '加载处置日志失败'
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }, [enabled])

  const runAction = useCallback(
    async (runner: () => Promise<unknown>) => {
      setActing(true)
      setError(null)
      try {
        await runner()
        await refresh()
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : '操作失败'
        setError(message)
        throw actionError
      } finally {
        setActing(false)
      }
    },
    [refresh],
  )

  const suspendResource = useCallback(
    async (resourceId: string, reason?: string) => {
      await runAction(() => suspendCommunityModerationResource({ resourceId, reason }))
    },
    [runAction],
  )

  const approveResource = useCallback(
    async (resourceId: string, note?: string) => {
      await runAction(() => approveCommunityModerationResource({ resourceId, note }))
    },
    [runAction],
  )

  const banUser = useCallback(
    async (userId: string, reason?: string, durationHours?: number) => {
      await runAction(() =>
        banCommunityModerationUser({
          userId,
          reason,
          durationHours,
        }),
      )
    },
    [runAction],
  )

  const resolveReport = useCallback(
    async (
      reportId: string,
      action: CommunityModerationReportResolveInput['action'],
      note?: string,
    ) => {
      await runAction(() => resolveCommunityModerationReport({ reportId, action, note }))
    },
    [runAction],
  )

  const deleteMessage = useCallback(
    async (messageId: string) => {
      await runAction(() => deleteCommunityBoardMessage(messageId))
      notifyCommunityBoardChanged()
    },
    [runAction],
  )

  const cancelTask = useCallback(
    async (taskId: string) => {
      await runAction(() => cancelCommunityTask(taskId))
    },
    [runAction],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!autoScan || !enabled) return
    const timer = window.setInterval(() => {
      void refresh()
    }, AUTO_SCAN_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [autoScan, enabled, refresh])

  return {
    scan,
    logs,
    loading,
    acting,
    error,
    scanError,
    refresh,
    suspendResource,
    approveResource,
    banUser,
    resolveReport,
    deleteMessage,
    cancelTask,
  }
}
