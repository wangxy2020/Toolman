import type {
  ModelInfo,
  ProviderConfig,
  StreamChunk,
  TestResult,
} from '../types.js'
import { ProviderError } from '../types.js'
import {
  resolveDeepSeekExtraBody,
  resolveOpenAiModelName,
  resolveOllamaExtraBody,
  isKimiChatModelId,
} from '../model-aliases.js'
import { assertApiKey, providerFetch, readErrorBody, resolveOpenAiBaseUrl } from '../utils.js'

function formatProviderHttpError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    const message = parsed.error?.message?.trim()
    if (message) {
      if (/supported API model names/i.test(message)) {
        return `模型名称无效：${message}`
      }
      return message
    }
  } catch {
    // ignore malformed body
  }
  return body.trim() || `HTTP ${status}`
}

export async function throwProviderHttpError(response: Response): Promise<never> {
  const body = await readErrorBody(response)
  throw new ProviderError(
    `Provider 请求失败 (${response.status}): ${formatProviderHttpError(response.status, body)}`,
    response.status >= 500 || response.status === 429,
  )
}

export function buildHeaders(config: ProviderConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  }
}

export function supportsUsageInStream(config: ProviderConfig): boolean {
  return config.type === 'openai' || config.type === 'azure_openai'
}

export async function fetchOpenAiModels(config: ProviderConfig): Promise<ModelInfo[]> {
  assertApiKey(config)
  const baseUrl = resolveOpenAiBaseUrl(config)
  const response = await providerFetch(config, `${baseUrl}/models`, {
    headers: buildHeaders(config),
  })

  if (!response.ok) {
    throw new ProviderError(
      `获取模型列表失败 (${response.status}): ${await readErrorBody(response)}`,
      response.status >= 500,
    )
  }

  const data = (await response.json()) as {
    data?: Array<{ id: string }>
  }

  return (data.data ?? []).map((m) => ({ id: m.id, name: m.id }))
}

export async function testOpenAiConnection(config: ProviderConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    // Chat ping first: GET /models is slow or restricted on Moonshot / DeepSeek.
    await pingOpenAiChat(config)
    return { success: true, latencyMs: Date.now() - start }
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : '连接失败',
    }
  }
}

export function resolveOpenAiPingModel(config: ProviderConfig): string {
  if (config.testModel?.trim()) {
    return resolveOpenAiModelName(config, config.testModel)
  }
  const base = (config.baseUrl ?? '').toLowerCase()
  if (base.includes('deepseek')) return 'deepseek-v4-flash'
  if (base.includes('moonshot') || base.includes('kimi.ai')) return 'kimi-k2.6'
  if (base.includes('dashscope') || base.includes('aliyuncs')) return 'qwen-plus'
  if (base.includes('bigmodel')) return 'glm-4-flash'
  if (base.includes('openai.com')) return 'gpt-4o-mini'
  return 'gpt-4o-mini'
}

export function buildOpenAiPingBody(config: ProviderConfig): Record<string, unknown> {
  const model = resolveOpenAiPingModel(config)
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    stream: false,
  }
  if (isKimiChatModelId(model)) {
    body.thinking = { type: 'disabled' }
  }
  return body
}

async function pingOpenAiChat(config: ProviderConfig): Promise<void> {
  assertApiKey(config)
  const baseUrl = resolveOpenAiBaseUrl(config)
  const response = await providerFetch(config, `${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(buildOpenAiPingBody(config)),
  })

  if (!response.ok) {
    throw new ProviderError(
      `Provider 请求失败 (${response.status}): ${await readErrorBody(response)}`,
      response.status >= 500 || response.status === 429,
    )
  }
}

export function mergeExtraBody(
  config: ProviderConfig,
  model: string,
  paramsExtra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...resolveDeepSeekExtraBody(config, model),
    ...resolveOllamaExtraBody(config, model),
    ...paramsExtra,
  }
}

export function yieldTextOrReasoning(
  text: string,
  routeThinkingAsAnswer: boolean,
): StreamChunk[] {
  if (!text) return []
  if (routeThinkingAsAnswer) {
    return [{ type: 'text-delta', text }]
  }
  return [{ type: 'reasoning-delta', text }]
}
