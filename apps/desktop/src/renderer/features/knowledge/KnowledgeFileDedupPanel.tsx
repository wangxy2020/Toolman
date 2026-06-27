import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, type KnowledgeFileDedupStreamEvent } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconExternalLink, IconFile, IconFolder, IconTrash } from '../../components/icons'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from '../../components/module-page-status'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { useI18n } from '../../i18n/useI18n'

interface DuplicateFile {
  path: string
  sizeBytes: number
  mtimeMs?: number
}

interface DuplicateGroup {
  contentHash: string
  sizeBytes: number
  files: DuplicateFile[]
}

interface ScanStats {
  scannedCount: number
  totalSizeBytes: number
  savableBytes: number
}

interface DedupFileRow {
  path: string
  sizeBytes: number
  contentHash: string
  fileName: string
  extension: string
  mtimeMs: number
  isFirstInGroup: boolean
}

export interface DedupScanProgress {
  phase: 'listing' | 'hashing'
  scanned: number
  total: number
  etaSeconds: number | null
}

export interface DedupScanState {
  scanning: boolean
  progress: DedupScanProgress | null
}

type SelectMode = 'all' | 'largest' | 'oldest' | 'smart'

type PendingDedupDelete =
  | { kind: 'selected'; paths: string[]; message: string }
  | { kind: 'single'; path: string; message: string }

interface Props {
  workspaceId: string
  folderPath: string | null
  onFolderPathChange: (path: string) => void
  onScanStateChange?: (state: DedupScanState) => void
  refreshToken?: number
}

function formatBytes(bytes: number): string {
  const value = Number.isFinite(bytes) && bytes >= 0 ? bytes : 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatStatSize(bytes: number): string {
  const value = Number.isFinite(bytes) && bytes >= 0 ? bytes : 0
  const mb = value / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.max(mb, 0.01).toFixed(mb >= 10 ? 0 : 1)} MB`
}

function formatEta(seconds: number | null, t: TranslateFn): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return t('knowledgePage.dedup.etaCalculating')
  }
  if (seconds < 60) return t('knowledgePage.dedup.etaSeconds', { count: Math.ceil(seconds) })
  if (seconds < 3600) return t('knowledgePage.dedup.etaMinutes', { count: Math.ceil(seconds / 60) })
  return t('knowledgePage.dedup.etaHours', { hours: (seconds / 3600).toFixed(1) })
}

function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] ?? filePath
}

function getExtension(filePath: string): string {
  const name = getFileName(filePath)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return '—'
  return name.slice(dot + 1).toUpperCase()
}

function flattenGroups(groups: DuplicateGroup[]): DedupFileRow[] {
  const rows: DedupFileRow[] = []
  for (const group of groups) {
    group.files.forEach((file, index) => {
      rows.push({
        path: file.path,
        sizeBytes: file.sizeBytes,
        contentHash: group.contentHash,
        fileName: getFileName(file.path),
        extension: getExtension(file.path),
        mtimeMs: file.mtimeMs ?? 0,
        isFirstInGroup: index === 0,
      })
    })
  }
  return rows
}

function normalizeScanStats(data: Partial<ScanStats> & { groups: DuplicateGroup[] }): ScanStats {
  return {
    scannedCount: Number(data.scannedCount) || 0,
    totalSizeBytes: Number(data.totalSizeBytes) || 0,
    savableBytes: Number(data.savableBytes) || 0,
  }
}

export function KnowledgeFileDedupPanel({
  workspaceId,
  folderPath,
  onFolderPathChange: _onFolderPathChange,
  onScanStateChange,
  refreshToken = 0,
}: Props) {
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
          const startedAt = scanStartedAtRef.current
          let etaSeconds: number | null = null
          if (
            startedAt &&
            event.phase === 'hashing' &&
            event.total > 0 &&
            event.scanned > 0
          ) {
            const elapsedSec = (Date.now() - startedAt) / 1000
            const rate = event.scanned / elapsedSec
            if (rate > 0) {
              etaSeconds = (event.total - event.scanned) / rate
            }
          }

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
    if (mode === 'all') {
      setSelectedPaths(new Set())
      return
    }

    const next = new Set<string>()
    for (const group of groups) {
      if (mode === 'smart') {
        for (let i = 1; i < group.files.length; i += 1) {
          next.add(group.files[i]!.path)
        }
        continue
      }

      let target = group.files[0]!
      for (let i = 1; i < group.files.length; i += 1) {
        const candidate = group.files[i]!
        if (mode === 'largest' && candidate.sizeBytes > target.sizeBytes) {
          target = candidate
        }
        if (mode === 'oldest' && (candidate.mtimeMs ?? 0) < (target.mtimeMs ?? 0)) {
          target = candidate
        }
      }
      next.add(target.path)
    }
    setSelectedPaths(next)
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
    const filePaths = target.kind === 'selected' ? target.paths : [target.path]
    setPendingDelete(null)
    setLoading(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.KnowledgeFileDedupDelete, {
      workspaceId,
      filePaths,
    })

    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    if (target.kind === 'selected') {
      setSelectedPaths(new Set())
    }

    await handleScan()

    if (target.kind === 'selected') {
      const data = result.data as { deleted: number; failed: Array<{ path: string; message: string }> }
      if (data.failed.length > 0) {
        setError(t('knowledgePage.dedup.deletePartialResult', { deleted: data.deleted, failed: data.failed.length }))
      }
    }
  }

  const openPath = async (path: string) => {
    await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
  }

  const openParentFolder = async (path: string) => {
    const normalized = path.replace(/[/\\]+$/, '')
    const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
    if (index <= 0) return
    await openPath(normalized.slice(0, index))
  }

  const progressPercent =
    progress && progress.phase === 'hashing' && progress.total > 0
      ? Math.min(100, Math.round((progress.scanned / progress.total) * 100))
      : progress?.phase === 'listing' && progress.scanned > 0
        ? Math.min(30, Math.round(progress.scanned / 50))
        : 0

  if (!folderPath) {
    return (
      <div className="tm-dedup-empty">
        <p className="tm-dedup-empty-title">{t('knowledgePage.dedup.pickFolderTitle')}</p>
        <p className="tm-dedup-empty-hint">{t('knowledgePage.dedup.pickFolderHint')}</p>
      </div>
    )
  }

  return (
    <div className="tm-dedup-page">
      {loading ? (
        <div className="tm-dedup-loading">
          <p className="tm-dedup-loading-title">
            {progress?.phase === 'listing'
              ? t('knowledgePage.dedup.phaseListing')
              : t('knowledgePage.dedup.phaseHashing')}
          </p>
          <p className="tm-dedup-loading-meta">
            {progress?.phase === 'hashing' && progress.total > 0
              ? t('knowledgePage.dedup.progressHashing', {
                  scanned: progress.scanned,
                  total: progress.total,
                  percent: progressPercent,
                })
              : progress && progress.scanned > 0
                ? t('knowledgePage.dedup.progressListed', { scanned: progress.scanned })
                : t('knowledgePage.dedup.preparing')}
          </p>
          <p className="tm-dedup-loading-meta">
            {t('knowledgePage.dedup.etaRemaining', {
              eta: formatEta(progress?.etaSeconds ?? null, t),
            })}
          </p>
          <div className="tm-dedup-progress">
            <div
              className="tm-dedup-progress-bar"
              style={{
                width: `${Math.max(progressPercent, progress && progress.scanned > 0 ? 4 : 0)}%`,
              }}
            />
          </div>
          <button
            type="button"
            className="tm-btn tm-btn--ghost tm-dedup-cancel-btn"
            disabled={cancelling}
            onClick={() => void handleCancelScan()}
          >
            {cancelling ? t('knowledgePage.dedup.cancelling') : t('knowledgePage.dedup.cancelScan')}
          </button>
        </div>
      ) : null}

      {stats && !loading ? (
        <div className="tm-dedup-stats">
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">{t('knowledgePage.dedup.statsTotalFiles')}</span>
            <strong className="tm-dedup-stat-value">{stats.scannedCount}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">{t('knowledgePage.dedup.statsTotalSize')}</span>
            <strong className="tm-dedup-stat-value">{formatStatSize(stats.totalSizeBytes)}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">{t('knowledgePage.dedup.statsDuplicateGroups')}</span>
            <strong className="tm-dedup-stat-value">{duplicateGroupCount}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">{t('knowledgePage.dedup.statsSavable')}</span>
            <strong className="tm-dedup-stat-value">{formatStatSize(stats.savableBytes)}</strong>
          </div>
        </div>
      ) : null}

      {!loading && stats && rows.length === 0 ? (
        <div className="tm-dedup-empty tm-dedup-empty--inline">
          <p className="tm-dedup-empty-title">{t('knowledgePage.dedup.noDuplicatesTitle')}</p>
          <p className="tm-dedup-empty-hint">{t('knowledgePage.dedup.noDuplicatesHint')}</p>
        </div>
      ) : null}

      {rows.length > 0 && !loading ? (
        <>
          <div className="tm-dedup-toolbar">
            <h3 className="tm-dedup-toolbar-title">
              {t('knowledgePage.dedup.duplicateTitle', { count: duplicateGroupCount })}
            </h3>
            <div className="tm-dedup-toolbar-actions">
              {(
                [
                  ['all', t('knowledgePage.dedup.modeAll')],
                  ['largest', t('knowledgePage.dedup.modeLargest')],
                  ['oldest', t('knowledgePage.dedup.modeOldest')],
                  ['smart', t('knowledgePage.dedup.modeSmart')],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`tm-dedup-filter-btn${selectMode === mode ? ' tm-dedup-filter-btn--active' : ''}`}
                  onClick={() => applySelectMode(mode)}
                >
                  {label}
                </button>
              ))}
              <span className="tm-dedup-toolbar-sep" />
              <button type="button" className="tm-dedup-filter-btn" onClick={handleSelectAll}>
                {t('knowledgePage.dedup.selectAll')}
              </button>
              <button type="button" className="tm-dedup-filter-btn" onClick={handleClearSelection}>
                {t('knowledgePage.dedup.clearSelection')}
              </button>
              <button
                type="button"
                className="tm-dedup-delete-btn"
                disabled={loading || selectedPaths.size === 0}
                onClick={handleDeleteSelected}
              >
                {selectedPaths.size > 0
                  ? t('knowledgePage.dedup.deleteCount', { count: selectedPaths.size })
                  : t('knowledgePage.dedup.delete')}
              </button>
            </div>
          </div>

          <div className="tm-dedup-table-wrap">
            <table className="tm-dedup-table">
              <thead>
                <tr>
                  <th className="tm-dedup-col-check" />
                  <th>{t('knowledgePage.dedup.colFileName')}</th>
                  <th className="tm-dedup-col-type">{t('knowledgePage.dedup.colFileType')}</th>
                  <th className="tm-dedup-col-size">{t('knowledgePage.dedup.colSize')}</th>
                  <th className="tm-dedup-col-actions">{t('knowledgePage.dedup.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.path}
                    className={selectedPaths.has(row.path) ? 'tm-dedup-row--selected' : ''}
                  >
                    <td className="tm-dedup-col-check">
                      <input
                        type="checkbox"
                        checked={selectedPaths.has(row.path)}
                        onChange={() => togglePath(row.path)}
                      />
                    </td>
                    <td>
                      <div className="tm-dedup-file-cell">
                        <IconFile size={16} />
                        <span className="tm-dedup-file-name" title={row.path}>
                          {row.fileName}
                          {row.isFirstInGroup ? (
                            <span className="tm-dedup-file-badge">{t('knowledgePage.dedup.keepBadge')}</span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="tm-dedup-col-type">{row.extension}</td>
                    <td className="tm-dedup-col-size">{formatBytes(row.sizeBytes)}</td>
                    <td className="tm-dedup-col-actions">
                      <div
                        className="tm-dedup-row-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="tm-dedup-icon-btn"
                          title={t('knowledgePage.dedup.openFile')}
                          onClick={() => void openPath(row.path)}
                        >
                          <IconExternalLink size={15} />
                        </button>
                        <button
                          type="button"
                          className="tm-dedup-icon-btn"
                          title={t('knowledgePage.dedup.openFolder')}
                          onClick={() => void openParentFolder(row.path)}
                        >
                          <IconFolder size={15} />
                        </button>
                        <button
                          type="button"
                          className="tm-dedup-icon-btn tm-dedup-icon-btn--danger"
                          title={t('knowledgePage.dedup.deleteFile')}
                          disabled={loading}
                          onClick={() => handleDeleteSingle(row.path)}
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('knowledgePage.deleteFile')}
          message={pendingDelete.message}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmPendingDelete()}
        />
      ) : null}
    </div>
  )
}
