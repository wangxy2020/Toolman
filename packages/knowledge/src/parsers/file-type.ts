import { basename, extname } from 'node:path'
import type { SupportedFileKind } from './types.js'

const EXT_MAP: Record<string, SupportedFileKind> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.pdf': 'pdf',
  '.doc': 'doc',
  '.docx': 'docx',
  '.wps': 'wps',
  '.xls': 'xls',
  '.xlsx': 'xlsx',
  '.csv': 'csv',
  '.pptx': 'pptx',
  '.html': 'html',
  '.htm': 'html',
  '.epub': 'epub',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.bmp': 'image',
}

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] as const

export function isImageFilePath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase().slice(1)
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

export const KNOWLEDGE_SUPPORTED_EXTENSIONS = [
  'md',
  'markdown',
  'txt',
  'pdf',
  'doc',
  'docx',
  'wps',
  'xls',
  'xlsx',
  'csv',
  'pptx',
  'html',
  'htm',
  'epub',
] as const

export const KNOWLEDGE_WATCH_INCLUDE_EXTENSIONS = [
  ...KNOWLEDGE_SUPPORTED_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
] as const

export const DEFAULT_KNOWLEDGE_WATCH_INCLUDE = [
  `**/*.{${KNOWLEDGE_WATCH_INCLUDE_EXTENSIONS.join(',')}}`,
] as const

export function detectFileKind(filePath: string): SupportedFileKind | null {
  const ext = extname(filePath).toLowerCase()
  return EXT_MAP[ext] ?? null
}

export function kindFromMimeType(mimeType: string | undefined): SupportedFileKind | null {
  if (!mimeType) return null
  switch (mimeType) {
    case 'application/pdf':
      return 'pdf'
    case 'text/markdown':
      return 'markdown'
    case 'text/plain':
    case 'text/csv':
      return mimeType === 'text/csv' ? 'csv' : 'text'
    case 'application/msword':
      return 'doc'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx'
    case 'application/wps-office.doc':
    case 'application/vnd.ms-works':
      return 'wps'
    case 'application/vnd.ms-excel':
      return 'xls'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'pptx'
    case 'text/html':
      return 'html'
    case 'application/epub+zip':
      return 'epub'
    default:
      if (mimeType.startsWith('image/')) return 'image'
      return null
  }
}

/** 根据原始路径、文件名或 MIME 推断类型（blob 暂存路径无扩展名时使用） */
export function resolveFileKind(hints: {
  path?: string
  fileName?: string
  mimeType?: string
}): SupportedFileKind | null {
  for (const candidate of [
    hints.path,
    hints.fileName ? `/${hints.fileName}` : undefined,
  ]) {
    if (!candidate) continue
    const kind = detectFileKind(candidate)
    if (kind) return kind
  }
  return kindFromMimeType(hints.mimeType)
}

/** macOS / Windows 系统自动生成的目录元数据，不参与索引 */
export const KNOWLEDGE_SYSTEM_JUNK_FILENAMES = [
  '.DS_Store',
  '.localized',
  'Thumbs.db',
  'desktop.ini',
] as const

/** Office / LibreOffice 打开文档时产生的锁文件与临时文件，不参与监控与向量化 */
export const KNOWLEDGE_IGNORED_INGEST_GLOB_PATTERNS = [
  '**/.DS_Store',
  '**/.localized',
  '**/Thumbs.db',
  '**/desktop.ini',
  '**/~$*',
  '**/~*.xlsx',
  '**/~*.xls',
  '**/~*.doc',
  '**/~*.docx',
  '**/~*.ppt',
  '**/~*.pptx',
  '**/.~lock.*',
  '**/~*.tmp',
  '**/._*',
] as const

const OFFICE_LOCK_EXTENSION = /\.(docx?|xlsx?|pptx?|ppt|csv|tmp|wbk|xlk)$/i

const SYSTEM_JUNK_FILENAMES = new Set<string>(KNOWLEDGE_SYSTEM_JUNK_FILENAMES)

export function isIgnoredKnowledgeIngestFile(filePath: string): boolean {
  const name = basename(filePath).normalize('NFC')
  if (!name) return true
  if (SYSTEM_JUNK_FILENAMES.has(name)) return true
  // Word / Excel 锁文件，如 ~$报告.docx、~$报表.xlsx
  if (name.startsWith('~$')) return true
  // 全角/变体 ~$ 锁文件
  if (/^[~\uFF5E\u223C][\$＄]/.test(name)) return true
  // LibreOffice 锁文件，如 .~lock.报告.xlsx#
  if (name.startsWith('.~lock.')) return true
  // macOS 资源分叉文件，如 ._报告.xlsx
  if (name.startsWith('._')) return true
  // Office 临时文件，如 ~WRL1234.tmp、~DF1234.tmp
  if (/^~.+\.tmp$/i.test(name)) return true
  // Excel/Office 同目录下以 ~ 开头的锁/临时 Office 文件（如 ~报表.xlsx）
  if (name.startsWith('~') && OFFICE_LOCK_EXTENSION.test(name)) return true
  return false
}

export function isSupportedKnowledgeFile(
  filePath: string,
  options?: { ocrEnabled?: boolean },
): boolean {
  if (isIgnoredKnowledgeIngestFile(filePath)) return false
  const kind = detectFileKind(filePath)
  if (!kind) return false
  if (kind === 'image') return Boolean(options?.ocrEnabled)
  return true
}

export function defaultTitle(filePath: string): string {
  return basename(filePath)
}

export function mimeTypeForKind(kind: SupportedFileKind, filePath?: string): string {
  switch (kind) {
    case 'markdown':
      return 'text/markdown'
    case 'text':
      return 'text/plain'
    case 'pdf':
      return 'application/pdf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'wps':
      return 'application/wps-office.doc'
    case 'xls':
      return 'application/vnd.ms-excel'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'csv':
      return 'text/csv'
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case 'html':
      return 'text/html'
    case 'epub':
      return 'application/epub+zip'
    case 'image': {
      if (!filePath) return 'image/jpeg'
      const ext = extname(filePath).toLowerCase()
      switch (ext) {
        case '.png':
          return 'image/png'
        case '.webp':
          return 'image/webp'
        case '.gif':
          return 'image/gif'
        case '.bmp':
          return 'image/bmp'
        default:
          return 'image/jpeg'
      }
    }
  }
}
