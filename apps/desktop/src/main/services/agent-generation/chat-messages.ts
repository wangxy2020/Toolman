import {
  buildModelTextFromUserBlocks,
  ContentBlockSchema,
  userBlocksHaveUnresolvedAttachments,
  type ContentBlock,
} from '@toolman/shared'
import { blocksToText } from '@toolman/db'
import {
  ProviderError,
  type ChatContentPart,
  type ChatMessage,
  providerSupportsOpenAiVision,
} from '@toolman/model-gateway'
import { getMessageRepository } from '../../db/repos'
import { getBlobDataUrl } from '../blob.service'
import type { getAssistantRow } from '../assistant.service'
import type { getProviderConfig } from '../provider.service'

export function assertAttachmentContentResolved(
  blocks: ContentBlock[],
  mcpServerIds?: string[],
): void {
  if (!userBlocksHaveUnresolvedAttachments(blocks, { mcpServerIds })) return

  for (const block of blocks) {
    if (block.type === 'file' && (block.delivery === 'docx_tool' || block.delivery === 'excel_tool')) continue
    if (block.type === 'file' && !block.content?.trim() && !(block.visionPages && block.visionPages.length > 0)) {
      throw new Error(`附件「${block.name}」未能准备就绪，请重新发送`)
    }
    if (block.type === 'image' && !block.blobHash?.trim()) {
      throw new Error(
        `图片附件「${block.alt ?? block.path ?? '未命名'}」未能加载，请重新发送`,
      )
    }
  }
}

export function buildUserChatMessage(userContentBlocks: ContentBlock[]): ChatMessage | null {
  const images = userContentBlocks.flatMap((block) => {
    if (block.type === 'image' && block.blobHash?.trim()) {
      return [{ blobHash: block.blobHash, alt: block.alt }]
    }
    if (block.type === 'file' && block.blobHash?.trim()) {
      const name = block.name || block.path || ''
      if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name) || block.mimeType?.startsWith('image/')) {
        return [{ blobHash: block.blobHash, alt: name }]
      }
    }
    return []
  })
  const visionPageImages = userContentBlocks.flatMap((block) => {
    if (block.type !== 'file' || !block.visionPages?.length) return []
    return block.visionPages.map((page) => ({
      blobHash: page.blobHash,
      alt: `${block.name} 第${page.pageNumber}页`,
    }))
  })

  const modelText = buildModelTextFromUserBlocks(userContentBlocks)
  const visionHints = userContentBlocks
    .filter((block) => block.type === 'file' && block.visionPages && block.visionPages.length > 0)
    .map(
      (block) =>
        `附件「${block.type === 'file' ? block.name : ''}」已作为 ${block.type === 'file' ? block.visionPages!.length : 0} 页图片发送，请直接阅读图片内容作答。`,
    )

  const combinedText = [modelText, ...visionHints].filter((part) => part.trim()).join('\n\n')

  if (!combinedText.trim() && images.length === 0 && visionPageImages.length === 0) return null

  if (images.length === 0 && visionPageImages.length === 0) {
    return { role: 'user', content: combinedText }
  }

  const parts: ChatContentPart[] = []
  if (combinedText.trim()) {
    parts.push({ type: 'text', text: combinedText })
  }

  for (const image of images) {
    if (!image.blobHash?.trim()) continue
    parts.push({
      type: 'image_url',
      image_url: { url: getBlobDataUrl(image.blobHash) },
    })
  }

  for (const page of visionPageImages) {
    parts.push({
      type: 'image_url',
      image_url: { url: getBlobDataUrl(page.blobHash) },
    })
  }

  return { role: 'user', content: parts }
}

function chatMessageHasImages(content: ChatMessage['content']): boolean {
  return Array.isArray(content) && content.some((part) => part.type === 'image_url')
}

export function assertProviderSupportsVisionInput(
  providerConfig: ReturnType<typeof getProviderConfig>,
  model: string,
  userContentBlocks: ContentBlock[],
): void {
  if (!providerConfig || providerSupportsOpenAiVision(providerConfig, model)) return
  const userMessage = buildUserChatMessage(userContentBlocks)
  if (userMessage && chatMessageHasImages(userMessage.content)) {
    throw new ProviderError(
      '当前模型不支持图片输入。请切换到支持视觉的模型（如 deepseek-v4-pro），或移除图片后重试。',
      false,
    )
  }
}

function buildHistoryChatMessage(blocks: ContentBlock[], role: 'user' | 'assistant'): ChatMessage | null {
  if (role === 'assistant') {
    const text = blocksToText(blocks)
    return text ? { role, content: text } : null
  }

  return buildUserChatMessage(blocks)
}

export function buildChatMessages(
  sessionId: string,
  assistant: ReturnType<typeof getAssistantRow>,
  userContentBlocks: ContentBlock[],
  excludeMessageIds: string[],
  extraSystemHint?: string,
): ChatMessage[] {
  const exclude = new Set(excludeMessageIds)
  const history = getMessageRepository()
    .listCompletedRows(sessionId)
    .filter((row) => !exclude.has(row.id))
  const chatMessages: ChatMessage[] = []

  const systemParts: string[] = []
  if (assistant?.systemPrompt) systemParts.push(assistant.systemPrompt)
  if (extraSystemHint?.trim()) systemParts.push(extraSystemHint.trim())
  if (systemParts.length) {
    chatMessages.push({ role: 'system', content: systemParts.join('\n\n') })
  }

  for (const msg of history) {
    const blocks = ContentBlockSchema.array().parse(JSON.parse(msg.contentBlocksJson))
    const chatMessage =
      msg.role === 'user' || msg.role === 'assistant'
        ? buildHistoryChatMessage(blocks, msg.role)
        : null
    if (chatMessage) {
      chatMessages.push(chatMessage)
    }
  }

  const userMessage = buildUserChatMessage(userContentBlocks)
  if (userMessage) {
    chatMessages.push(userMessage)
  }

  return chatMessages
}
