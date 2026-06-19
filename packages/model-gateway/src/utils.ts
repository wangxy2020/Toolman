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

export async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.text()
    return body.slice(0, 400)
  } catch {
    return response.statusText
  }
}
