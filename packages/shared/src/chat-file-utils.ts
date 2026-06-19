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

  const sections = files
    .filter((file) => Boolean(file.content?.trim()))
    .map((file) => {
      const truncatedNote = file.truncated ? '\n\n（文件内容过长，已截断）' : ''
      return `### 附件：${file.name}\n\n${file.content}${truncatedNote}`
    })

  if (sections.length === 0) return userText

  const header = userText || defaultPrefix
  return `${header}\n\n${sections.join('\n\n')}`
}

export function userBlocksHaveUnresolvedAttachments(blocks: UserBlock[]): boolean {
  return blocks.some((block) => {
    if (block.type === 'image') return !block.blobHash?.trim()
    if (block.type === 'file') {
      const file = block as UserBlock & {
        visionPages?: Array<{ blobHash: string }>
      }
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
