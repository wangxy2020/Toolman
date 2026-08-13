import type { TranslationLanguage } from '@toolman/shared'
import { clientLog } from '../../lib/client-log'
import { normalizeTranslationLanguages } from '../chat/translation-utils'
import {
  detectTranslationDocumentKind,
  fileNameFromPath,
  type TranslationDocumentKind,
} from './translation-document-utils'

export const TRANSLATION_STORAGE_KEY = 'toolman:translation-data'

export type TranslationDocumentPageSnapshotStatus = 'idle' | 'parsed' | 'done' | 'empty'

export interface TranslationDocumentPageSnapshot {
  pageNumber: number
  sourceText: string
  translatedText: string
  parsedMarkdown?: string
  status: TranslationDocumentPageSnapshotStatus
}

export interface TranslationContrastItem {
  id: string
  workspaceId: string
  title: string
  sourceText: string
  targetText: string
  languages: [TranslationLanguage, TranslationLanguage]
  createdAt: number
  updatedAt: number
}

export interface TranslationDocumentItem {
  id: string
  workspaceId: string
  title: string
  filePath: string
  fileName: string
  kind: TranslationDocumentKind
  /** Extracted plain text from the source document. */
  sourceText: string
  targetText: string
  /** Per-page parse / translation cache for reopen without re-running pipelines. */
  pageSnapshots?: TranslationDocumentPageSnapshot[]
  languages: [TranslationLanguage, TranslationLanguage]
  createdAt: number
  updatedAt: number
}

export interface TranslationData {
  contrasts: TranslationContrastItem[]
  documents: TranslationDocumentItem[]
}

export function createContrastId(): string {
  return `contrast-${crypto.randomUUID()}`
}

export function createDocumentId(): string {
  return `document-${crypto.randomUUID()}`
}

function normalizePageSnapshots(
  raw: unknown,
): TranslationDocumentPageSnapshot[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined

  const snapshots = raw
    .map((item): TranslationDocumentPageSnapshot | null => {
      if (!item || typeof item !== 'object') return null
      const record = item as Partial<TranslationDocumentPageSnapshot>
      const pageNumber =
        typeof record.pageNumber === 'number' && Number.isFinite(record.pageNumber)
          ? Math.floor(record.pageNumber)
          : 0
      if (pageNumber < 1) return null

      const sourceText = typeof record.sourceText === 'string' ? record.sourceText : ''
      const translatedText = typeof record.translatedText === 'string' ? record.translatedText : ''
      const parsedMarkdown =
        typeof record.parsedMarkdown === 'string' ? record.parsedMarkdown : undefined
      const status: TranslationDocumentPageSnapshotStatus =
        record.status === 'parsed' ||
        record.status === 'done' ||
        record.status === 'empty' ||
        record.status === 'idle'
          ? record.status
          : 'idle'

      if (
        status !== 'empty' &&
        !sourceText.trim() &&
        !translatedText.trim() &&
        !parsedMarkdown?.trim()
      ) {
        return null
      }

      return {
        pageNumber,
        sourceText,
        translatedText,
        ...(parsedMarkdown !== undefined ? { parsedMarkdown } : {}),
        status,
      }
    })
    .filter((item): item is TranslationDocumentPageSnapshot => item !== null)
    .sort((left, right) => left.pageNumber - right.pageNumber)

  return snapshots.length > 0 ? snapshots : undefined
}

export function normalizeContrast(
  item: Partial<TranslationContrastItem>,
  workspaceId: string,
): TranslationContrastItem {
  const now = Date.now()
  return {
    id: item.id ?? createContrastId(),
    workspaceId: item.workspaceId ?? workspaceId,
    title: item.title ?? '',
    sourceText: typeof item.sourceText === 'string' ? item.sourceText : '',
    targetText: typeof item.targetText === 'string' ? item.targetText : '',
    languages: normalizeTranslationLanguages(item.languages),
    createdAt: item.createdAt ?? item.updatedAt ?? now,
    updatedAt: item.updatedAt ?? now,
  }
}

export function normalizeDocument(
  item: Partial<TranslationDocumentItem>,
  workspaceId: string,
): TranslationDocumentItem {
  const now = Date.now()
  const filePath = typeof item.filePath === 'string' ? item.filePath : ''
  const fileName =
    typeof item.fileName === 'string' && item.fileName.trim()
      ? item.fileName
      : fileNameFromPath(filePath)
  const kind =
    item.kind === 'pdf' || item.kind === 'word' || item.kind === 'excel' || item.kind === 'unknown'
      ? item.kind
      : detectTranslationDocumentKind(filePath || fileName)

  return {
    id: item.id ?? createDocumentId(),
    workspaceId: item.workspaceId ?? workspaceId,
    title: item.title?.trim() || fileName || '',
    filePath,
    fileName,
    kind,
    sourceText: typeof item.sourceText === 'string' ? item.sourceText : '',
    targetText: typeof item.targetText === 'string' ? item.targetText : '',
    pageSnapshots: normalizePageSnapshots(item.pageSnapshots),
    languages: normalizeTranslationLanguages(item.languages),
    createdAt: item.createdAt ?? item.updatedAt ?? now,
    updatedAt: item.updatedAt ?? now,
  }
}

export function normalizeTranslationData(
  raw: Partial<TranslationData> | null | undefined,
): TranslationData {
  const contrasts = Array.isArray(raw?.contrasts) ? raw.contrasts : []
  const documents = Array.isArray(raw?.documents) ? raw.documents : []
  return {
    contrasts: contrasts
      .filter((item) => typeof item.workspaceId === 'string' && item.workspaceId.length > 0)
      .map((item) => normalizeContrast(item, item.workspaceId!)),
    documents: documents
      .filter(
        (item) =>
          typeof item.workspaceId === 'string' &&
          item.workspaceId.length > 0 &&
          typeof item.filePath === 'string' &&
          item.filePath.length > 0,
      )
      .map((item) => normalizeDocument(item, item.workspaceId!)),
  }
}

export function loadTranslationData(): TranslationData {
  try {
    const raw = localStorage.getItem(TRANSLATION_STORAGE_KEY)
    if (!raw) return { contrasts: [], documents: [] }
    return normalizeTranslationData(JSON.parse(raw) as Partial<TranslationData>)
  } catch {
    return { contrasts: [], documents: [] }
  }
}

export function saveTranslationData(data: TranslationData): void {
  try {
    localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(normalizeTranslationData(data)))
  } catch (error) {
    clientLog.error('[translation-storage] failed to persist translation data', error)
  }
}

export function createEmptyContrastItem(
  workspaceId: string,
  title: string,
  languages?: [TranslationLanguage, TranslationLanguage],
): TranslationContrastItem {
  const now = Date.now()
  return normalizeContrast(
    {
      workspaceId,
      title,
      sourceText: '',
      targetText: '',
      languages,
      createdAt: now,
      updatedAt: now,
    },
    workspaceId,
  )
}

export function createDocumentItem(
  workspaceId: string,
  filePath: string,
  languages?: [TranslationLanguage, TranslationLanguage],
): TranslationDocumentItem {
  const now = Date.now()
  const fileName = fileNameFromPath(filePath)
  return normalizeDocument(
    {
      workspaceId,
      title: fileName,
      filePath,
      fileName,
      kind: detectTranslationDocumentKind(filePath),
      sourceText: '',
      targetText: '',
      languages,
      createdAt: now,
      updatedAt: now,
    },
    workspaceId,
  )
}

export function buildContrastTitle(
  contrasts: TranslationContrastItem[],
  workspaceId: string,
  sourceText: string,
  untitledLabel: string,
): string {
  const firstLine = sourceText.trim().split('\n')[0]?.trim() ?? ''
  const base = firstLine
    ? firstLine.length > 48
      ? `${firstLine.slice(0, 48)}…`
      : firstLine
    : untitledLabel

  return uniqueTitle(base, contrasts, workspaceId)
}

export function uniqueTitle(
  base: string,
  items: Array<{ workspaceId: string; title: string }>,
  workspaceId: string,
): string {
  const used = new Set(
    items.filter((item) => item.workspaceId === workspaceId).map((item) => item.title),
  )
  if (!used.has(base)) return base

  let index = 2
  while (used.has(`${base} (${index})`)) {
    index += 1
  }
  return `${base} (${index})`
}

export function normalizeRenameTitle(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed || fallback
}
