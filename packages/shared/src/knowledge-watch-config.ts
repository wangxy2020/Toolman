/** Office / LibreOffice 打开文档时产生的锁文件与临时文件 */
export const KNOWLEDGE_OFFICE_TEMP_EXCLUDE_PATTERNS = [
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

/** 文件夹监听默认可匹配的扩展名（含图片；图片向量化需开启 OCR） */
export const KNOWLEDGE_WATCH_INCLUDE_EXTENSIONS = [
  'md',
  'markdown',
  'txt',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'pptx',
  'html',
  'htm',
  'epub',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
] as const

export function buildDefaultKnowledgeWatchIncludePatterns(): string[] {
  return [`**/*.{${KNOWLEDGE_WATCH_INCLUDE_EXTENSIONS.join(',')}}`]
}

export function buildDefaultKnowledgeWatchExcludePatterns(): string[] {
  return [
    '**/node_modules/**',
    '**/.git/**',
    '**/.DS_Store',
    '**/.localized',
    '**/Thumbs.db',
    '**/desktop.ini',
    ...KNOWLEDGE_OFFICE_TEMP_EXCLUDE_PATTERNS,
  ]
}

export function effectiveKnowledgeWatchInclude(include: string[]): string[] {
  const defaults = buildDefaultKnowledgeWatchIncludePatterns()
  if (include.length === 0) return defaults
  return [...new Set([...include, ...defaults])]
}

export function effectiveKnowledgeWatchExclude(exclude: string[]): string[] {
  const defaults = buildDefaultKnowledgeWatchExcludePatterns()
  return [...new Set([...exclude, ...defaults])]
}

export const KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER = buildDefaultKnowledgeWatchIncludePatterns().join(
  '\n',
)

export const KNOWLEDGE_WATCH_SUPPORTED_TYPES_HINT =
  '支持 Markdown、TXT、PDF、Word（doc/docx）、Excel（xls/xlsx）、PPTX、CSV、HTML、EPUB，以及 PNG/JPG/WebP/GIF/BMP 图片（图片索引需开启 OCR）。'

export const KNOWLEDGE_WATCH_OFFICE_TEMP_EXCLUDE_HINT =
  '已默认排除 Office/LibreOffice 锁文件与临时文件（~$ 开头、~*.xlsx 等 Office 锁文件、.~lock. 开头、~*.tmp、._ 开头）。'
