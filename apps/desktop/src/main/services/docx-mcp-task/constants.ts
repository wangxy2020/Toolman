import type { OfficeToDocxMethod } from '../office-to-docx.service'

export const DOCX_MCP_BATCH_TOOL_NAME = '__docx_mcp_batch__'

export const DOCX_MCP_READ_TOOL_NAMES = new Set([
  'read_document',
  'get_document_info',
  'search_text',
  'list_images',
  'read_comments',
  'read_header_footer',
  'read_footnotes',
])

export class DocxMcpNotReadyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocxMcpNotReadyError'
  }
}

export interface DocxWorkingCopy {
  sourcePath: string
  workingPath: string
  fileName: string
  /** 源文件非 .docx 时，记录转换方式 */
  conversionMethod?: Exclude<OfficeToDocxMethod, 'copy'>
}

const DOCX_THOROUGH_EDIT_KEYWORDS =
  /审查|审阅|批注|修订|修改|纠错|优化|润色|校对|review|comment|audit|annotate/i

export const DOCX_PARAGRAPH_REWRITE_KEYWORDS =
  /整段(?:重写|替换|改写|修改)|段落(?:重写|改写|替换)|重写(?:该|此|本|那一)?段|按列表(?:重写|改写)|列表化|重组(?:该|此|本)?段(?:落)?|重组结构|全文重写|rewrite\s+(?:the\s+)?paragraph|full\s+paragraph/i

export const DOCX_MIN_EDITS_BEFORE_FINISH = 3
export const DOCX_MAX_CONTINUE_NUDGES = 4
export const DOCX_MIN_IDLE_ROUNDS_TO_FINISH = 2

export function requestsDocxParagraphRewrite(userText: string): boolean {
  return DOCX_PARAGRAPH_REWRITE_KEYWORDS.test(userText.trim())
}

export function isDocxThoroughEditRequest(userText: string): boolean {
  return DOCX_THOROUGH_EDIT_KEYWORDS.test(userText.trim())
}
