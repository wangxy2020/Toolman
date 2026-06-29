import type { SupportedFileKind } from '@toolman/knowledge'

export const CHAT_MAX_PDF_VISION_PAGES = 5
export const CHAT_TEXT_MAX_BYTES = 512 * 1024
export const QUICK_PDF_TIMEOUT_MS = 15 * 1000
export const CHAT_PARSE_TIMEOUT_MS = 30 * 1000
export const CHAT_OCR_TIMEOUT_MS = 3 * 60 * 1000

export const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.log',
  '.yaml',
  '.yml',
  '.html',
  '.htm',
])

/** 通过 parseFile 提取正文的类型（与知识库解析器共用；doc/wps 在 DOCX MCP 路径下不经过此处） */
export const PARSE_TEXT_KINDS = new Set<SupportedFileKind>([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'pptx',
  'html',
  'epub',
  'markdown',
  'text',
  'csv',
])

export const DOCX_MCP_SOURCE_KINDS = new Set<SupportedFileKind>(['docx', 'doc', 'wps'])
export const EXCEL_MCP_SOURCE_KINDS = new Set<SupportedFileKind>(['xlsx', 'xls'])

export function isLikelyTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot === -1) return true
  return TEXT_EXTENSIONS.has(lower.slice(dot))
}

export function truncateForChat(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('文件内容为空')
  }
  const bytes = Buffer.byteLength(trimmed, 'utf-8')
  if (bytes <= CHAT_TEXT_MAX_BYTES) return trimmed
  const slice = Buffer.from(trimmed, 'utf-8').subarray(0, CHAT_TEXT_MAX_BYTES).toString('utf-8')
  return `${slice.trim()}\n\n（文件内容过长，已截断）`
}
