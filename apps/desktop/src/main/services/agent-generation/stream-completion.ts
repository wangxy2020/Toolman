import { createModelGateway, ProviderError } from '@toolman/model-gateway'
import { compactChatMessagesForContextRetry } from './chat-context-fit'
import { parseExceedContextSizeError, shrinkChatMessageImages, chatMessagesHaveImages } from './chat-vision-image'
import type { StreamPlainCompletionOptions } from './types'
import { logStructured } from '../structured-log.service'

const gateway = createModelGateway()

export async function streamPlainCompletion(opts: StreamPlainCompletionOptions): Promise<void> {
  if (!opts.providerConfig) {
    throw new ProviderError('Provider 配置无效')
  }

  let messages = opts.chatMessages
  let retriedHistory = false
  let retriedSmallerImages = false

  while (true) {
    try {
      for await (const chunk of gateway.chatStream(opts.providerConfig, {
        model: opts.model,
        messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
      })) {
        if (chunk.type === 'reasoning-delta' && chunk.text) {
          opts.onThinking?.(chunk.text)
        }
        if (chunk.type === 'text-delta' && chunk.text) {
          opts.onText(chunk.text)
        }
        if (chunk.type === 'done' && chunk.usage) {
          opts.onUsage({
            prompt: chunk.usage.prompt,
            completion: chunk.usage.completion,
            total: chunk.usage.total,
          })
        }
      }
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const overflow = parseExceedContextSizeError(message)
      if (!overflow) throw error

      const compacted = !retriedHistory ? compactChatMessagesForContextRetry(messages) : null
      if (compacted) {
        retriedHistory = true
        messages = compacted
        logStructured(
          'agent-generation',
          'warn',
          `context overflow (${overflow.promptTokens}/${overflow.contextSize}); retrying without earlier turns`,
        )
        continue
      }

      if (!retriedSmallerImages && chatMessagesHaveImages(messages)) {
        retriedSmallerImages = true
        messages = shrinkChatMessageImages(messages, 768)
        logStructured(
          'agent-generation',
          'warn',
          `context overflow (${overflow.promptTokens}/${overflow.contextSize}); retrying with smaller images`,
        )
        continue
      }

      throw new ProviderError(
        overflow.contextSize > 0
          ? `请求超过模型上下文（${overflow.promptTokens}/${overflow.contextSize}）。请缩短对话或换一张更小的图后再试。`
          : '请求超过模型上下文。请缩短对话或换一张更小的图后再试。',
        false,
      )
    }
  }
}

export function getModelGateway() {
  return gateway
}
