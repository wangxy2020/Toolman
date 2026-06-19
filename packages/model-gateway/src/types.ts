export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'openai_compatible'
  | 'azure_openai'

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ChatContentPart[]
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ChatParams {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  tools?: ToolDefinition[]
}

export interface ChatCompletionResult {
  content: string
  toolCalls: ToolCall[]
  usage?: {
    prompt: number
    completion: number
    total: number
  }
}

export interface ModelInfo {
  id: string
  name: string
  contextWindow?: number
}

export interface StreamChunk {
  type: 'text-delta' | 'reasoning-delta' | 'done' | 'error'
  text?: string
  usage?: {
    prompt: number
    completion: number
    total: number
  }
  error?: string
}

export interface ProviderConfig {
  type: ProviderType
  baseUrl?: string | null
  apiKey?: string | null
}

export interface TestResult {
  success: boolean
  latencyMs: number
  error?: string
}

export interface ModelGateway {
  chatStream(config: ProviderConfig, params: ChatParams): AsyncGenerator<StreamChunk>
  chatComplete(config: ProviderConfig, params: ChatParams): Promise<ChatCompletionResult>
  fetchModels(config: ProviderConfig): Promise<ModelInfo[]>
  testConnection(config: ProviderConfig): Promise<TestResult>
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export function parseModelId(modelId: string): { providerId: string; model: string } {
  const idx = modelId.indexOf(':')
  if (idx === -1) throw new ProviderError(`无效的 modelId: ${modelId}`)
  return { providerId: modelId.slice(0, idx), model: modelId.slice(idx + 1) }
}

export function formatModelId(providerId: string, model: string): string {
  return `${providerId}:${model}`
}
