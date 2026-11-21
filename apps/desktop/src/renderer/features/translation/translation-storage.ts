import type { TranslationLanguage } from '@toolman/shared'
import { clientLog } from '../../lib/client-log'
import { normalizeTranslationLanguages } from '../chat/translation-utils'
import {
  detectTranslationDocumentKind,
  fileNameFromPath,
  type TranslationDocumentKind,
} from './translation-document-utils'
import { normalizePageRemarks } from './document-page-remarks'

export const TRANSLATION_STORAGE_KEY = 'toolman:translation-data'

export function translationStorageKeyForWorkspace(workspaceId: string): string {
  return `${TRANSLATION_STORAGE_KEY}:${workspaceId}`
}

function migrateLegacyTranslationData(workspaceId: string): TranslationData | null {
  try {
    const raw = localStorage.getItem(TRANSLATION_STORAGE_KEY)
    if (!raw) return null
    const legacy = normalizeTranslationData(JSON.parse(raw) as Partial<TranslationData>)
    const scoped: TranslationData = {
      folders: legacy.folders,
      contrasts: legacy.contrasts.filter((item) => item.workspaceId === workspaceId),
      documents: legacy.documents.filter((item) => item.workspaceId === workspaceId),
    }
    if (scoped.contrasts.length === 0 && scoped.documents.length === 0) return null
    localStorage.setItem(translationStorageKeyForWorkspace(workspaceId), JSON.stringify(scoped))
    const remaining: TranslationData = {
      folders: legacy.folders,
      contrasts: legacy.contrasts.filter((item) => item.workspaceId !== workspaceId),
      documents: legacy.documents.filter((item) => item.workspaceId !== workspaceId),
    }
    if (remaining.contrasts.length === 0 && remaining.documents.length === 0) {
      localStorage.removeItem(TRANSLATION_STORAGE_KEY)
    } else {
      localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(remaining))
    }
    return scoped
  } catch {
    return null
  }
}

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

export const DEFAULT_TRANSLATION_FOLDER_ID = 'folder-documents'
export const DEFAULT_TRANSLATION_FOLDER_NAME = '文档翻译'

export interface TranslationFolderItem {
  id: string
  name: string
  isDefault?: boolean
  createdAt: number
}

export interface TranslationDocumentItem {
  id: string
  workspaceId: string
  title: string
  filePath: string
  fileName: string
  kind: TranslationDocumentKind
  /** Sidebar folder that owns this document. */
  folderId: string
  /** Extracted plain text from the source document. */
  sourceText: string
  targetText: string
  /** Per-page parse / translation cache for reopen without re-running pipelines. */
  pageSnapshots?: TranslationDocumentPageSnapshot[]
  /** Per-page overlay remarks keyed by page number. */
  pageRemarks?: Record<string, string>
  languages: [TranslationLanguage, TranslationLanguage]
  createdAt: number
  updatedAt: number
}

export interface TranslationData {
  folders: TranslationFolderItem[]
  contrasts: TranslationContrastItem[]
  documents: TranslationDocumentItem[]
}

export function createContrastId(): string {
  return `contrast-${crypto.randomUUID()}`
}

export function createDocumentId(): string {
  return `document-${crypto.randomUUID()}`
}

export function createFolderId(): string {
  return `folder-${crypto.randomUUID()}`
}

export function createDefaultTranslationFolder(): TranslationFolderItem {
  return {
    id: DEFAULT_TRANSLATION_FOLDER_ID,
    name: DEFAULT_TRANSLATION_FOLDER_NAME,
    isDefault: true,
    createdAt: 0,
  }
}

export function buildTranslationFolderName(existing: TranslationFolderItem[]): string {
  const used = new Set(existing.map((item) => item.name))
  let index = existing.filter((item) => !item.isDefault).length + 1
  let candidate = index === 1 ? '文件夹' : `文件夹 ${index}`
  while (used.has(candidate)) {
    index += 1
    candidate = `文件夹 ${index}`
  }
  return candidate
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

  const folderId =
    typeof item.folderId === 'string' && item.folderId.trim()
      ? item.folderId.trim()
      : DEFAULT_TRANSLATION_FOLDER_ID

  return {
    id: item.id ?? createDocumentId(),
    workspaceId: item.workspaceId ?? workspaceId,
    title: item.title?.trim() || fileName || '',
    filePath,
    fileName,
    kind,
    folderId,
    sourceText: typeof item.sourceText === 'string' ? item.sourceText : '',
    targetText: typeof item.targetText === 'string' ? item.targetText : '',
    pageSnapshots: normalizePageSnapshots(item.pageSnapshots),
    pageRemarks: normalizePageRemarks(item.pageRemarks),
    languages: normalizeTranslationLanguages(item.languages),
    createdAt: item.createdAt ?? item.updatedAt ?? now,
    updatedAt: item.updatedAt ?? now,
  }
}

function normalizeFolder(item: Partial<TranslationFolderItem>): TranslationFolderItem | null {
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!id || !name) return null
  return {
    id,
    name,
    isDefault: item.isDefault === true || id === DEFAULT_TRANSLATION_FOLDER_ID,
    createdAt:
      typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now(),
  }
}

export function normalizeTranslationData(
  raw: Partial<TranslationData> | null | undefined,
): TranslationData {
  const contrasts = Array.isArray(raw?.contrasts) ? raw.contrasts : []
  const documents = Array.isArray(raw?.documents) ? raw.documents : []
  const rawFolders = Array.isArray(raw?.folders) ? raw.folders : []
  const folders = rawFolders
    .map((item) => normalizeFolder(item))
    .filter((item): item is TranslationFolderItem => item !== null)
  const hasDefault = folders.some((item) => item.id === DEFAULT_TRANSLATION_FOLDER_ID)
  const normalizedFolders = hasDefault
    ? folders.map((item) =>
        item.id === DEFAULT_TRANSLATION_FOLDER_ID
          ? { ...item, isDefault: true, name: item.name || DEFAULT_TRANSLATION_FOLDER_NAME }
          : item,
      )
    : [createDefaultTranslationFolder(), ...folders]

  const folderIds = new Set(normalizedFolders.map((item) => item.id))

  return {
    folders: normalizedFolders,
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
      .map((item) => {
        const document = normalizeDocument(item, item.workspaceId!)
        return folderIds.has(document.folderId)
          ? document
          : { ...document, folderId: DEFAULT_TRANSLATION_FOLDER_ID }
      }),
  }
}

export function loadTranslationData(workspaceId?: string | null): TranslationData {
  try {
    if (workspaceId) {
      const key = translationStorageKeyForWorkspace(workspaceId)
      const raw = localStorage.getItem(key)
      if (raw) return normalizeTranslationData(JSON.parse(raw) as Partial<TranslationData>)
      const migrated = migrateLegacyTranslationData(workspaceId)
      if (migrated) return migrated
      return normalizeTranslationData({})
    }
    const raw = localStorage.getItem(TRANSLATION_STORAGE_KEY)
    if (!raw) return normalizeTranslationData({})
    return normalizeTranslationData(JSON.parse(raw) as Partial<TranslationData>)
  } catch {
    return normalizeTranslationData({})
  }
}

export function saveTranslationData(data: TranslationData, workspaceId?: string | null): void {
  try {
    const normalized = normalizeTranslationData(data)
    if (workspaceId) {
      const scoped: TranslationData = {
        folders: normalized.folders,
        contrasts: normalized.contrasts.filter((item) => item.workspaceId === workspaceId),
        documents: normalized.documents.filter((item) => item.workspaceId === workspaceId),
      }
      localStorage.setItem(translationStorageKeyForWorkspace(workspaceId), JSON.stringify(scoped))
      return
    }
    localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(normalized))
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
  folderId: string = DEFAULT_TRANSLATION_FOLDER_ID,
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
      folderId,
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
