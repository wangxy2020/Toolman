import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, type KnowledgeFileDedupStreamEvent } from '@toolman/shared'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'
import type {
  DedupScanProgress,
  DuplicateGroup,
  KnowledgeFileDedupPanelProps,
  PendingDedupDelete,
  ScanStats,
  SelectMode,
} from './knowledge-dedup-types'
import {
  computeEtaSeconds,
  flattenGroups,
  normalizeScanStats,
  pathsForSelectMode,
} from './knowledge-dedup-utils'
import { deleteDedupFiles } from './knowledge-dedup-operations'

export type { DedupScanProgress, DedupScanState } from './knowledge-dedup-types'

export function useKnowledgeFileDedupPanel({
  workspaceId,
  folderPath,
  onScanStateChange,
  refreshToken = 0,
}: KnowledgeFileDedupPanelProps) {
  const { t } = useI18n()
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [stats, setStats] = useState<ScanStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState<SelectMode>('all')
  const [progress, setProgress] = useState<DedupScanProgress | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDedupDelete | null>(null)
  const scanStartedAtRef = useRef<number | null>(null)
  const scanGenerationRef = useRef(0)
  const handleScanRef = useRef<() => Promise<void>>(async () => {})

  useRegisterModulePanelError('knowledge-dedup', error, () => setError(null))
  useRegisterModulePanelStatus(
    'knowledge-dedup-scan',
    loading
      ? {
          tone: 'info',
          message:
            progress && progress.total > 0
              ? t('knowledgePage.dedup.loadingProgress', {
                  scanned: progress.scanned,
                  total: progress.total,
                })
              : t('knowledgePage.dedup.loadingStatus'),
        }
      : null,
  )

  const applyScanResult = useCallback((data: ScanStats & { groups: DuplicateGroup[] }) => {
    setGroups(data.groups)
    setStats(normalizeScanStats(data))
  }, [])

  const updateScanState = useCallback(
    (scanning: boolean, nextProgress: DedupScanProgress | null) => {
      onScanStateChange?.({ scanning, progress: nextProgress })
    },
    [onScanStateChange],
  )

  const finishScan = useCallback(() => {
    setLoading(false)
    setProgress(null)
    setCancelling(false)
    scanStartedAtRef.current = null
    updateScanState(false, null)
  }, [updateScanState])

  const rows = useMemo(() => flattenGroups(groups), [groups])
  const duplicateGroupCount = groups.length

  const handleScan = useCallback(async () => {
    if (!workspaceId || !folderPath?.trim()) return

    const generation = scanGenerationRef.current + 1
    scanGenerationRef.current = generation

    setLoading(true)
    setError(null)
    setSelectedPaths(new Set())
    setProgress({ phase: 'listing', scanned: 0, total: 0, etaSeconds: null })
    scanStartedAtRef.current = Date.now()
    updateScanState(true, { phase: 'listing', scanned: 0, total: 0, etaSeconds: null })

    const result = await window.api.invoke(IpcChannel.KnowledgeFileDedupScan, {
      workspaceId,
      folderPath: folderPath.trim(),
    })

    if (generation !== scanGenerationRef.current) return

    finishScan()

    if (!result.ok) {
      if (result.error.code !== 'ABORTED') {
        setError(result.error.message)
      }
      return
    }

    const data = result.data as ScanStats & { groups: DuplicateGroup[] }
    applyScanResult(data)
  }, [workspaceId, folderPath, updateScanState, finishScan, applyScanResult])

  handleScanRef.current = handleScan

  const handleCancelScan = async () => {
    if (!workspaceId || !loading || cancelling) return

    setCancelling(true)
    scanGenerationRef.current += 1

    const result = await window.api.invoke(IpcChannel.KnowledgeFileDedupScanCancel, {
      workspaceId,
    })

    setCancelling(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    finishScan()
  }

  useEffect(() => {
    const unsubscribe = window.api.subscribe(
      IpcChannel.KnowledgeFileDedupStream,
      (payload) => {
        const event = payload as KnowledgeFileDedupStreamEvent
        if (event.workspaceId !== workspaceId) return

        if (event.type === 'progress') {
          const etaSeconds = computeEtaSeconds(event, scanStartedAtRef.current)
          const nextProgress: DedupScanProgress = {
            phase: event.phase,
            scanned: event.scanned,
            total: event.total,
            etaSeconds,
          }
          setProgress(nextProgress)
          updateScanState(true, nextProgress)
          return
        }

        if (event.type === 'done') {
          applyScanResult(event.result)
          finishScan()
          return
        }

        if (event.type === 'error') {
          setError(event.message)
          finishScan()
          return
        }

        if (event.type === 'cancelled') {
          finishScan()
        }
      },
    )

    return unsubscribe
  }, [workspaceId, updateScanState, applyScanResult, finishScan])

  useEffect(() => {
    if (folderPath) {
      void handleScanRef.current()
    }
  }, [folderPath, refreshToken])

  useEffect(() => {
    const currentWorkspaceId = workspaceId
    return () => {
      scanGenerationRef.current += 1
      if (currentWorkspaceId) {
        void window.api.invoke(IpcChannel.KnowledgeFileDedupScanCancel, {
          workspaceId: currentWorkspaceId,
        })
      }
    }
  }, [workspaceId])

  const applySelectMode = (mode: SelectMode) => {
    setSelectMode(mode)
    setSelectedPaths(pathsForSelectMode(groups, mode))
  }

  const handleSelectAll = () => {
    setSelectedPaths(new Set(rows.map((row) => row.path)))
    setSelectMode('all')
  }

  const handleClearSelection = () => {
    setSelectedPaths(new Set())
    setSelectMode('all')
  }

  const togglePath = (path: string) => {
    setSelectedPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    setSelectMode('all')
  }

  const handleDeleteSelected = () => {
    if (!workspaceId || selectedPaths.size === 0) return
    setPendingDelete({
      kind: 'selected',
      paths: Array.from(selectedPaths),
      message: t('knowledgePage.dedup.deleteSelectedConfirm', { count: selectedPaths.size }),
    })
  }

  const handleDeleteSingle = (path: string) => {
    if (!workspaceId) return
    setPendingDelete({
      kind: 'single',
      path,
      message: t('knowledgePage.dedup.deleteOneConfirm'),
    })
  }

  const confirmPendingDelete = async () => {
    if (!workspaceId || !pendingDelete) return

    const target = pendingDelete
    setPendingDelete(null)
    setLoading(true)
    setError(null)

    const result = await deleteDedupFiles(workspaceId, target, t)

    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    if (result.clearSelection) {
      setSelectedPaths(new Set())
    }

    await handleScan()
  }

  return {
    t,
    folderPath,
    groups,
    stats,
    loading,
    selectedPaths,
    selectMode,
    progress,
    cancelling,
    pendingDelete,
    setPendingDelete,
    rows,
    duplicateGroupCount,
    handleCancelScan,
    applySelectMode,
    handleSelectAll,
    handleClearSelection,
    togglePath,
    handleDeleteSelected,
    handleDeleteSingle,
    confirmPendingDelete,
  }
}

export type KnowledgeFileDedupPanelState = ReturnType<typeof useKnowledgeFileDedupPanel>
