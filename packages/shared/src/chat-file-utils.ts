import { DOCX_MCP_SERVER_ID } from './agent-constants.js'

export { DOCX_MCP_SERVER_ID }

export interface ChatFilePayload {
  path: string
  name: string
  content: string
  truncated?: boolean
}

type UserBlock = {
  type: string
  text?: string
  name?: string
  path?: string
  content?: string
  truncated?: boolean
  blobHash?: string
  delivery?: string
  mimeType?: string
}

export function isDocxFileBlock(block: UserBlock): boolean {
  if (block.type !== 'file') return false
  const name = (block.name ?? block.path ?? '').toLowerCase()
  if (name.endsWith('.docx')) return true
  const mime = (block.mimeType ?? '').toLowerCase()
  return mime.includes('wordprocessingml.document')
}

/** 旧版 Word (.doc) 或 WPS 文字 (.wps)，需先转为 docx 再走 MCP */
export function isLegacyWordFileBlock(block: UserBlock): boolean {
  if (block.type !== 'file') return false
  const name = (block.name ?? block.path ?? '').toLowerCase()
  if (name.endsWith('.doc') && !name.endsWith('.docx')) return true
  if (name.endsWith('.wps')) return true
  const mime = (block.mimeType ?? '').toLowerCase()
  return mime === 'application/msword' || mime === 'application/wps-office.doc'
}

/** 可进入 DOCX MCP 审查流水线的 Word 附件（含 .docx / .doc / .wps） */
export function isDocxMcpSourceFileBlock(block: UserBlock): boolean {
  return isDocxFileBlock(block) || isLegacyWordFileBlock(block)
}

export function contentBlocksHaveAttachments(blocks: UserBlock[]): boolean {
  return blocks.some((block) => block.type === 'file' || block.type === 'image')
}

export function contentBlocksHaveDocxAttachments(blocks: UserBlock[]): boolean {
  return blocks.some(isDocxMcpSourceFileBlock)
}

export function isDocxMcpAttachmentBlock(
  block: UserBlock,
  mcpServerIds?: readonly string[],
): boolean {
  if (!mcpServerIds?.includes(DOCX_MCP_SERVER_ID)) return false
  if (!isDocxMcpSourceFileBlock(block)) return false
  return Boolean(block.path?.trim() || block.blobHash?.trim())
}

export function shouldEnableToolsWithAttachments(
  mcpServerIds: readonly string[],
  blocks: UserBlock[],
): boolean {
  if (!contentBlocksHaveAttachments(blocks)) {
    return mcpServerIds.length > 0
  }
  if (
    mcpServerIds.includes(DOCX_MCP_SERVER_ID) &&
    contentBlocksHaveDocxAttachments(blocks)
  ) {
    return true
  }
  return false
}

const DEFAULT_ATTACHMENT_PREFIX =
  '以下为用户上传的文件正文（已由应用解析并内联），请直接阅读并回答，无需访问本地磁盘或调用工具读取：'

/** 将用户消息块展开为发送给模型的文本（含文件正文） */
export function buildModelTextFromUserBlocks(
  blocks: UserBlock[],
  defaultPrefix = DEFAULT_ATTACHMENT_PREFIX,
): string {
  const userText = blocks
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text!)
    .join('\n')
    .trim()

  const files = blocks.filter((block) => block.type === 'file')
  if (files.length === 0) return userText

  const docxToolFiles = files.filter(
    (file) => file.delivery === 'docx_tool' && file.path?.trim(),
  )
  const inlineFiles = files.filter((file) => Boolean(file.content?.trim()))

  const sections: string[] = []

  if (docxToolFiles.length > 0) {
    const docxLines = docxToolFiles
      .map((file) => `- ${file.name}: ${file.path}`)
      .join('\n')
    sections.push(
      [
        '用户上传了 Word 文档，请使用 DOCX MCP 的 read_document / add_comment / replace_text 等工具处理（参数 file_path 为绝对路径）：',
        docxLines,
      ].join('\n'),
    )
  }

  for (const file of inlineFiles) {
    const truncatedNote = file.truncated ? '\n\n（文件内容过长，已截断）' : ''
    sections.push(`### 附件：${file.name}\n\n${file.content}${truncatedNote}`)
  }

  if (sections.length === 0) return userText

  const header = userText || defaultPrefix
  return `${header}\n\n${sections.join('\n\n')}`
}

export function userBlocksHaveUnresolvedAttachments(
  blocks: UserBlock[],
  options?: { mcpServerIds?: readonly string[] },
): boolean {
  return blocks.some((block) => {
    if (block.type === 'image') return !block.blobHash?.trim()
    if (block.type === 'file') {
      if (isDocxMcpAttachmentBlock(block, options?.mcpServerIds)) return false
      const file = block as UserBlock & {
        visionPages?: Array<{ blobHash: string }>
      }
      if (file.delivery === 'docx_tool') return false
      if (file.content?.trim()) return false
      if (file.visionPages && file.visionPages.length > 0) return false
      return true
    }
    return false
  })
}

export function truncateAttachmentName(name: string, maxLength = 28): string {
  if (name.length <= maxLength) return name
  const head = Math.max(8, maxLength - 3)
  return `${name.slice(0, head)}…`
}

/** 写入消息表 content 字段的可见摘要（不含文件正文） */
export function buildStoredUserContent(blocks: UserBlock[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.type === 'file' && block.name) {
      lines.push(`附件：${block.name}`)
    }
    if (block.type === 'text' && block.text?.trim()) {
      lines.push(block.text.trim())
    }
  }
  return lines.join('\n')
}
