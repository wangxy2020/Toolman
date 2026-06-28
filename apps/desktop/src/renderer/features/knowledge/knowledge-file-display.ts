import type { KnowledgeDocument } from '@toolman/shared'
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
