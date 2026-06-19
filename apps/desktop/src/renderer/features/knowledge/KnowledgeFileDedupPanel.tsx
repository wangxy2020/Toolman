import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, type KnowledgeFileDedupStreamEvent } from '@toolman/shared'
import { IconExternalLink, IconFile, IconFolder, IconTrash } from '../../components/icons'

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

function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '计算中…'
  if (seconds < 60) return `约 ${Math.ceil(seconds)} 秒`
  if (seconds < 3600) return `约 ${Math.ceil(seconds / 60)} 分钟`
  return `约 ${(seconds / 3600).toFixed(1)} 小时`
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
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [stats, setStats] = useState<ScanStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState<SelectMode>('all')
  const [progress, setProgress] = useState<DedupScanProgress | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const scanStartedAtRef = useRef<number | null>(null)
  const scanGenerationRef = useRef(0)
  const handleScanRef = useRef<() => Promise<void>>(async () => {})

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

  const handleDeleteSelected = async () => {
    if (!workspaceId || selectedPaths.size === 0) return
    if (!window.confirm(`确定删除选中的 ${selectedPaths.size} 个重复文件吗？此操作不可恢复。`)) {
      return
    }

    setLoading(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.KnowledgeFileDedupDelete, {
      workspaceId,
      filePaths: Array.from(selectedPaths),
    })

    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { deleted: number; failed: Array<{ path: string; message: string }> }
    setSelectedPaths(new Set())
    await handleScan()

    if (data.failed.length > 0) {
      setError(`已删除 ${data.deleted} 个，${data.failed.length} 个删除失败`)
    }
  }

  const handleDeleteSingle = async (path: string) => {
    if (!workspaceId) return
    if (!window.confirm('确定删除此文件吗？此操作不可恢复。')) return

    setLoading(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.KnowledgeFileDedupDelete, {
      workspaceId,
      filePaths: [path],
    })

    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    await handleScan()
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
        <p className="tm-dedup-empty-title">选择文件夹开始查重</p>
        <p className="tm-dedup-empty-hint">点击右上角「选择文件夹」，选择要扫描的目录。</p>
      </div>
    )
  }

  return (
    <div className="tm-dedup-page">
      {error ? <div className="tm-dedup-error">{error}</div> : null}

      {loading ? (
        <div className="tm-dedup-loading">
          <p className="tm-dedup-loading-title">
            {progress?.phase === 'listing' ? '正在枚举文件…' : '正在扫描文件夹…'}
          </p>
          <p className="tm-dedup-loading-meta">
            {progress?.phase === 'hashing' && progress.total > 0
              ? `已处理 ${progress.scanned} / ${progress.total} 个文件（${progressPercent}%）`
              : progress && progress.scanned > 0
                ? `已发现 ${progress.scanned} 个文件`
                : '准备中…'}
          </p>
          <p className="tm-dedup-loading-meta">
            预计剩余：{formatEta(progress?.etaSeconds ?? null)}
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
            {cancelling ? '取消中…' : '取消扫描'}
          </button>
        </div>
      ) : null}

      {stats && !loading ? (
        <div className="tm-dedup-stats">
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">总文件数</span>
            <strong className="tm-dedup-stat-value">{stats.scannedCount}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">总大小</span>
            <strong className="tm-dedup-stat-value">{formatStatSize(stats.totalSizeBytes)}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">重复组数</span>
            <strong className="tm-dedup-stat-value">{duplicateGroupCount}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">可节省空间</span>
            <strong className="tm-dedup-stat-value">{formatStatSize(stats.savableBytes)}</strong>
          </div>
        </div>
      ) : null}

      {!loading && stats && rows.length === 0 ? (
        <div className="tm-dedup-empty tm-dedup-empty--inline">
          <p className="tm-dedup-empty-title">未发现重复文件</p>
          <p className="tm-dedup-empty-hint">该文件夹中的文件内容均不相同。</p>
        </div>
      ) : null}

      {rows.length > 0 && !loading ? (
        <>
          <div className="tm-dedup-toolbar">
            <h3 className="tm-dedup-toolbar-title">重复文件 ({duplicateGroupCount})</h3>
            <div className="tm-dedup-toolbar-actions">
              {(
                [
                  ['all', '所有'],
                  ['largest', '最大'],
                  ['oldest', '最旧'],
                  ['smart', '智能选择'],
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
                全选
              </button>
              <button type="button" className="tm-dedup-filter-btn" onClick={handleClearSelection}>
                取消
              </button>
              <button
                type="button"
                className="tm-dedup-delete-btn"
                disabled={loading || selectedPaths.size === 0}
                onClick={() => void handleDeleteSelected()}
              >
                删除{selectedPaths.size > 0 ? ` (${selectedPaths.size})` : ''}
              </button>
            </div>
          </div>

          <div className="tm-dedup-table-wrap">
            <table className="tm-dedup-table">
              <thead>
                <tr>
                  <th className="tm-dedup-col-check" />
                  <th>文件名</th>
                  <th className="tm-dedup-col-type">文件类型</th>
                  <th className="tm-dedup-col-size">大小</th>
                  <th className="tm-dedup-col-actions">操作</th>
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
                            <span className="tm-dedup-file-badge">保留</span>
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
                          title="打开文件"
                          onClick={() => void openPath(row.path)}
                        >
                          <IconExternalLink size={15} />
                        </button>
                        <button
                          type="button"
                          className="tm-dedup-icon-btn"
                          title="打开所在文件夹"
                          onClick={() => void openParentFolder(row.path)}
                        >
                          <IconFolder size={15} />
                        </button>
                        <button
                          type="button"
                          className="tm-dedup-icon-btn tm-dedup-icon-btn--danger"
                          title="删除"
                          disabled={loading}
                          onClick={() => void handleDeleteSingle(row.path)}
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
    </div>
  )
}
