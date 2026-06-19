import {
  type ChatCompletionResult,
  ChatParams,
  ModelGateway,
  ModelInfo,
  ProviderConfig,
  ProviderType,
  StreamChunk,
  TestResult,
} from './types.js'
import {
  chatCompleteOpenAiCompatible,
  fetchOpenAiModels,
  streamOpenAiCompatible,
  testOpenAiConnection,
} from './providers/openai.js'
import {
  fetchAnthropicModels,
  streamAnthropic,
  chatCompleteAnthropic,
  testAnthropicConnection,
} from './providers/anthropic.js'

const OPENAI_COMPAT_TYPES: ProviderType[] = [
  'openai',
  'ollama',
  'openai_compatible',
  'azure_openai',
  'google',
]

export class DefaultModelGateway implements ModelGateway {
  async *chatStream(config: ProviderConfig, params: ChatParams): AsyncGenerator<StreamChunk> {
    const stream = this.resolveStream(config, params)
    for await (const chunk of stream) {
      yield chunk
    }
  }

  async chatComplete(config: ProviderConfig, params: ChatParams): Promise<ChatCompletionResult> {
    if (config.type === 'anthropic') {
      if (params.tools?.length) {
        return chatCompleteAnthropic(config, params)
      }

      let content = ''
      let usage: ChatCompletionResult['usage']
      for await (const chunk of this.resolveStream(config, params)) {
        if (chunk.type === 'text-delta' && chunk.text) content += chunk.text
        if (chunk.type === 'done' && chunk.usage) usage = chunk.usage
      }
      return { content, toolCalls: [], usage }
    }

    if (OPENAI_COMPAT_TYPES.includes(config.type)) {
      return chatCompleteOpenAiCompatible(config, params)
    }

    throw new Error(`Unsupported provider type: ${config.type}`)
  }

  async fetchModels(config: ProviderConfig): Promise<ModelInfo[]> {
    if (config.type === 'anthropic') return fetchAnthropicModels(config)
    if (OPENAI_COMPAT_TYPES.includes(config.type)) return fetchOpenAiModels(config)
    throw new Error(`Unsupported provider type: ${config.type}`)
  }

  async testConnection(config: ProviderConfig): Promise<TestResult> {
    if (config.type === 'anthropic') return testAnthropicConnection(config)
    if (OPENAI_COMPAT_TYPES.includes(config.type)) return testOpenAiConnection(config)
    return { success: false, latencyMs: 0, error: `Unsupported provider type: ${config.type}` }
  }

  private resolveStream(config: ProviderConfig, params: ChatParams) {
    if (config.type === 'anthropic') return streamAnthropic(config, params)
    if (OPENAI_COMPAT_TYPES.includes(config.type)) return streamOpenAiCompatible(config, params)
    throw new Error(`Unsupported provider type: ${config.type}`)
  }
}

export function createModelGateway(): ModelGateway {
  return new DefaultModelGateway()
}

export * from './model-aliases.js'
export * from './types.js'
