export type TranslationDocumentKind = 'pdf' | 'word' | 'excel' | 'unknown'

const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
])

export function isTranslationDocumentPath(filePath: string): boolean {
  const ext = fileExtension(filePath)
  return DOCUMENT_EXTENSIONS.has(ext)
}

export function detectTranslationDocumentKind(filePath: string): TranslationDocumentKind {
  const ext = fileExtension(filePath)
  if (ext === 'pdf') return 'pdf'
  if (ext === 'doc' || ext === 'docx') return 'word'
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'excel'
  return 'unknown'
}

export function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || filePath
}

function fileExtension(filePath: string): string {
  const name = fileNameFromPath(filePath)
  const index = name.lastIndexOf('.')
  if (index <= 0) return ''
  return name.slice(index + 1).toLowerCase()
}
