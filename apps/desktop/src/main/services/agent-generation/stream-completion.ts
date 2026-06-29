import { createModelGateway, ProviderError } from '@toolman/model-gateway'
import type { StreamPlainCompletionOptions } from './types'

const gateway = createModelGateway()

export async function streamPlainCompletion(opts: StreamPlainCompletionOptions): Promise<void> {
  if (!opts.providerConfig) {
    throw new ProviderError('Provider 配置无效')
  }

  for await (const chunk of gateway.chatStream(opts.providerConfig, {
    model: opts.model,
    messages: opts.chatMessages,
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
}

export function getModelGateway() {
  return gateway
}
