export type SupportedFileKind =
  | 'markdown'
  | 'text'
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'xls'
  | 'xlsx'
  | 'csv'
  | 'pptx'
  | 'html'
  | 'epub'
  | 'image'

export interface ParsedDocument {
  title: string
  plainText: string
  mimeType: string
  kind: SupportedFileKind
}
