import type { TranslateFn } from '../../i18n/I18nProvider'
import type { DedupFileRow, DedupScanProgress, DuplicateGroup, ScanStats, SelectMode } from './knowledge-dedup-types'

export function getParentPath(filePath: string): string | null {
  const normalized = filePath.replace(/[/\\]+$/, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (index <= 0) return null
  return normalized.slice(0, index)
}

export function formatBytes(bytes: number): string {
  const value = Number.isFinite(bytes) && bytes >= 0 ? bytes : 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatStatSize(bytes: number): string {
  const value = Number.isFinite(bytes) && bytes >= 0 ? bytes : 0
  const mb = value / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.max(mb, 0.01).toFixed(mb >= 10 ? 0 : 1)} MB`
}

export function formatEta(seconds: number | null, t: TranslateFn): string {
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

export function flattenGroups(groups: DuplicateGroup[]): DedupFileRow[] {
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

export function normalizeScanStats(data: Partial<ScanStats> & { groups: DuplicateGroup[] }): ScanStats {
  return {
    scannedCount: Number(data.scannedCount) || 0,
    totalSizeBytes: Number(data.totalSizeBytes) || 0,
    savableBytes: Number(data.savableBytes) || 0,
  }
}

export function computeProgressPercent(progress: DedupScanProgress | null): number {
  if (progress && progress.phase === 'hashing' && progress.total > 0) {
    return Math.min(100, Math.round((progress.scanned / progress.total) * 100))
  }
  if (progress?.phase === 'listing' && progress.scanned > 0) {
    return Math.min(30, Math.round(progress.scanned / 50))
  }
  return 0
}

export function computeEtaSeconds(
  event: { phase: string; scanned: number; total: number },
  startedAt: number | null,
): number | null {
  if (!startedAt || event.phase !== 'hashing' || event.total <= 0 || event.scanned <= 0) {
    return null
  }
  const elapsedSec = (Date.now() - startedAt) / 1000
  const rate = event.scanned / elapsedSec
  if (rate <= 0) return null
  return (event.total - event.scanned) / rate
}

export function pathsForSelectMode(groups: DuplicateGroup[], mode: SelectMode): Set<string> {
  if (mode === 'all') return new Set()

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
  return next
}
