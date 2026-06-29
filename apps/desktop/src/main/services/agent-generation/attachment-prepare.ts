import { toErrorMessage, buildStoredUserContent } from '@toolman/shared'
import type { ContentBlock } from '@toolman/shared'
import { getMessageRepository } from '../../db/repos'
import {
  contentBlocksNeedModelPrepare,
  prepareChatAttachmentsForModel,
} from '../chat-attachment-prepare.service'
import { isAbortError, throwIfAborted, withAbortSignal } from '../../utils/abort-signal'
import { assertAttachmentContentResolved } from './chat-messages'
import { emitStreamEvent } from './emit'
import type { GenerationStreamContext } from './types'

export async function prepareGenerationAttachments(options: {
  userContentBlocks: ContentBlock[]
  userMessageId: string
  modelId: string
  workspaceId: string
  mcpServerIds: string[]
  documentOcrEnabled?: boolean
  signal: AbortSignal
  stream: GenerationStreamContext
  sessionId: string
  assistantMessageId: string
}): Promise<
  | { ok: true; generationBlocks: ContentBlock[]; generationText: string }
  | { ok: false }
  | null
> {
  if (!contentBlocksNeedModelPrepare(options.userContentBlocks)) {
    return null
  }

  const messages = getMessageRepository()
  options.stream.appendStatus('正在准备附件并发送给模型…')
  try {
    const generationBlocks = await withAbortSignal(
      prepareChatAttachmentsForModel({
        blocks: options.userContentBlocks,
        modelId: options.modelId,
        workspaceId: options.workspaceId,
        mcpServerIds: options.mcpServerIds,
        documentOcrEnabled: options.documentOcrEnabled,
        signal: options.signal,
        onStatus: (message) => {
          options.stream.appendStatus(`${message}\n`)
        },
      }),
      options.signal,
    )
    throwIfAborted(options.signal)
    assertAttachmentContentResolved(generationBlocks, options.mcpServerIds)
    const generationText = buildStoredUserContent(generationBlocks)
    messages.update(options.userMessageId, {
      content: generationText,
      contentBlocks: generationBlocks,
    })
    return { ok: true, generationBlocks, generationText }
  } catch (error) {
    if (isAbortError(error)) throw error
    const parseMessage = toErrorMessage(error, '附件解析失败')
    const ipcError = {
      code: 'INTERNAL_ERROR' as const,
      message: parseMessage,
      retryable: true,
      details: {
        name: error instanceof Error ? error.name : 'AttachmentParseError',
        stack: error instanceof Error ? error.stack ?? '' : '',
      },
    }
    messages.update(options.assistantMessageId, {
      status: 'failed',
      contentBlocks: options.stream.buffers.toContentBlocks(),
      error: ipcError,
    })
    emitStreamEvent({
      type: 'message.error',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      error: ipcError,
      timestamp: Date.now(),
    })
    return { ok: false }
  }
}
