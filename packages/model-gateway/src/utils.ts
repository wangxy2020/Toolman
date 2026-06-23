import type { ProviderConfig } from './types.js'
import { ProviderError } from './types.js'

export function resolveOpenAiBaseUrl(config: ProviderConfig): string {
  if (config.baseUrl) return config.baseUrl.replace(/\/$/, '')
  if (config.type === 'ollama') return 'http://127.0.0.1:11434/v1'
  return 'https://api.openai.com/v1'
}

export function resolveAnthropicBaseUrl(config: ProviderConfig): string {
  return (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')
}

export function assertApiKey(config: ProviderConfig): void {
  if (!config.apiKey && config.type !== 'ollama') {
    throw new ProviderError('API Key 未配置或无法读取，请在设置中重新填写', false)
  }
}

function isFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  const cause = (error as Error & { cause?: { code?: string } }).cause
  const causeCode = cause?.code?.toLowerCase() ?? ''
  return (
    error.name === 'TypeError' &&
    (message.includes('fetch failed') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      causeCode.includes('econnrefused') ||
      causeCode.includes('enotfound') ||
      causeCode.includes('etimedout'))
  )
}

function describeProviderEndpoint(config: ProviderConfig): string {
  if (config.type === 'ollama') {
    return `Ollama（${resolveOpenAiBaseUrl(config).replace(/\/v1$/i, '')}）`
  }
  return `模型服务（${resolveOpenAiBaseUrl(config)}）`
}

export function wrapProviderFetchError(config: ProviderConfig, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  if (isFetchNetworkError(error)) {
    const endpoint = describeProviderEndpoint(config)
    if (config.type === 'ollama') {
      return new ProviderError(
        `无法连接 ${endpoint}。请确认 Ollama 已启动（默认 http://127.0.0.1:11434），可运行 \`ollama serve\` 或打开 Ollama 应用。`,
        true,
      )
    }
    return new ProviderError(`无法连接 ${endpoint}，请检查网络或 API 地址配置。`, true)
  }
  const message = error instanceof Error ? error.message : String(error)
  return new ProviderError(message, true)
}

export async function providerFetch(
  config: ProviderConfig,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    throw wrapProviderFetchError(config, error)
  }
}

export async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.text()
    return body.slice(0, 400)
  } catch {
    return response.statusText
  }
}
