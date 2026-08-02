import type { KnowledgeDocument, KnowledgeIngestProgressDetail } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'

export type KnowledgeDocumentDisplayStatus = KnowledgeDocument['status'] | 'pending'

export function formatKnowledgeFileSize(sizeBytes: number | null | undefined): string {
  if (sizeBytes == null || sizeBytes < 0) return '—'
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`
  if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatKnowledgeDocTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

export function isMarkdownKnowledgeDocument(
  title: string,
  mimeType: string | null | undefined,
): boolean {
  const extension = getKnowledgeDocExtension(title, mimeType)
  return extension === 'md' || extension === 'markdown' || mimeType === 'text/markdown'
}

export function getKnowledgeDocExtension(
  title: string,
  mimeType: string | null | undefined,
): string {
  const fromTitle = title.includes('.') ? title.split('.').pop()?.toLowerCase() : ''
  if (fromTitle) return fromTitle

  switch (mimeType) {
    case 'application/pdf':
      return 'pdf'
    case 'text/plain':
      return 'txt'
    case 'text/markdown':
      return 'md'
    case 'text/html':
      return 'html'
    case 'text/csv':
      return 'csv'
    case 'application/msword':
      return 'doc'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx'
    case 'application/vnd.ms-excel':
      return 'xls'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'pptx'
    default:
      return ''
  }
}

export function isKnowledgeDocProcessing(status: KnowledgeDocumentDisplayStatus): boolean {
  return (
    status === 'pending' ||
    status === 'queued' ||
    status === 'parsing' ||
    status === 'chunking' ||
    status === 'embedding' ||
    status === 'indexing'
  )
}

export function getKnowledgeDocStatusLabel(
  status: KnowledgeDocumentDisplayStatus,
  t: TranslateFn,
  progress?: number | null,
): string {
  const key =
    status in DOC_STATUS_KEYS
      ? DOC_STATUS_KEYS[status as keyof typeof DOC_STATUS_KEYS]
      : 'processing'
  const label = t(`knowledgePage.docStatus.${key}`)
  if (progress != null && progress >= 0 && isKnowledgeDocProcessing(status)) {
    const percent = Math.min(100, Math.max(0, Math.round(progress)))
    return `${label} ${percent}%`
  }
  return label
}

const DOC_STATUS_KEYS = {
  pending: 'pending',
  queued: 'queued',
  parsing: 'parsing',
  chunking: 'chunking',
  embedding: 'embedding',
  indexing: 'indexing',
  ready: 'ready',
  failed: 'failed',
} as const satisfies Partial<Record<KnowledgeDocumentDisplayStatus, string>>

const INGEST_STAGE_RANK: Record<string, number> = {
  indexing: 0,
  embedding: 1,
  chunking: 2,
  parsing: 3,
  queued: 4,
  pending: 5,
}

/** Shorten long titles for the bottom status bar. */
export function truncateKnowledgeStatusFileName(name: string, max = 28): string {
  const trimmed = name.trim()
  if (trimmed.length <= max) return trimmed
  const dot = trimmed.lastIndexOf('.')
  const ext = dot > 0 && trimmed.length - dot <= 8 ? trimmed.slice(dot) : ''
  const keep = max - ext.length - 1
  if (keep < 4) return `${trimmed.slice(0, max - 1)}…`
  return `${trimmed.slice(0, keep)}…${ext}`
}

function formatIngestProgressDetailLabel(
  detail: KnowledgeIngestProgressDetail,
  t: TranslateFn,
): string {
  return detail.unit === 'page'
    ? t('knowledgePage.ingestStatus.pages', {
        current: detail.current,
        total: detail.total,
      })
    : t('knowledgePage.ingestStatus.chunks', {
        current: detail.current,
        total: detail.total,
      })
}

export function getKnowledgeDocStatusLabelWithDetail(
  status: KnowledgeDocumentDisplayStatus,
  t: TranslateFn,
  progress?: number | null,
  detail?: KnowledgeIngestProgressDetail | null,
): string {
  const stageLabel = getKnowledgeDocStatusLabel(status, t)
  if (!isKnowledgeDocProcessing(status)) return stageLabel

  const parts = [stageLabel]
  if (detail && detail.total > 0) {
    parts.push(formatIngestProgressDetailLabel(detail, t))
  }
  if (progress != null && progress >= 0) {
    const percent = Math.min(100, Math.max(0, Math.round(progress)))
    parts.push(`${percent}%`)
  }
  return parts.join(' ')
}

/**
 * Brief status-bar copy for active knowledge ingest.
 * Detail (pages/chunks) is placed early and also returned as `meta` so it stays visible.
 */
export function formatKnowledgeIngestStatusBarMessage(options: {
  items: KnowledgeDocument[]
  progressById: Record<string, number>
  detailById: Record<string, KnowledgeIngestProgressDetail>
  t: TranslateFn
}): { text: string; meta: string | null } | null {
  const processing = options.items.filter((item) => isKnowledgeDocProcessing(item.status))
  if (processing.length === 0) return null

  const active = [...processing].sort((left, right) => {
    const rankDelta =
      (INGEST_STAGE_RANK[left.status] ?? 99) - (INGEST_STAGE_RANK[right.status] ?? 99)
    if (rankDelta !== 0) return rankDelta
    const leftProgress = options.progressById[left.id] ?? 0
    const rightProgress = options.progressById[right.id] ?? 0
    return rightProgress - leftProgress
  })[0]!

  const stageLabel = getKnowledgeDocStatusLabel(active.status, options.t)
  const file = truncateKnowledgeStatusFileName(
    active.title || options.t('knowledgePage.ingestStatus.untitled'),
  )
  const percent = options.progressById[active.id]
  const detail = options.detailById[active.id]
  const detailLabel =
    detail && detail.total > 0 ? formatIngestProgressDetailLabel(detail, options.t) : null

  // Put pages/chunks before the filename so ellipsis does not hide them.
  const parts = [stageLabel]
  if (detailLabel) parts.push(detailLabel)
  if (percent != null && percent >= 0) {
    parts.push(`${Math.min(100, Math.max(0, Math.round(percent)))}%`)
  }
  parts.push(file)

  let text = parts.join(' · ')
  const queuedExtra = processing.filter((item) => item.id !== active.id).length
  if (queuedExtra > 0) {
    text = options.t('knowledgePage.ingestStatus.withOthers', {
      message: text,
      count: queuedExtra,
    })
  }
  return { text, meta: detailLabel }
}
