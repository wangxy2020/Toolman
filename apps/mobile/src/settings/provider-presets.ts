/**
 * Mobile API provider presets — mirrors desktop `provider-presets.ts`
 * network list (OpenAI-compatible chat only; Anthropic uses a different protocol).
 */

export type MobileProviderId =
  | 'deepseek'
  | 'openai'
  | 'moonshot'
  | 'zhipu'
  | 'qwen'
  | 'custom'

export type MobileProviderPreset = {
  id: MobileProviderId
  name: string
  /** Base URL including `/v1` when required by OpenAI-compatible chat. */
  defaultBaseUrl: string
  defaultModel: string
  suggestedModels: string[]
  apiKeyUrl?: string
  docUrl?: string
}

export const MOBILE_PROVIDER_PRESETS: MobileProviderPreset[] = [
  {
    id: 'deepseek',
    name: '深度求索',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    suggestedModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    docUrl: 'https://platform.deepseek.com/api-docs',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docUrl: 'https://platform.openai.com/docs/models',
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.6',
    suggestedModels: ['kimi-k2.6', 'kimi-k3', 'kimi-k2.5', 'moonshot-v1-8k'],
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    docUrl: 'https://platform.moonshot.cn/docs',
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    suggestedModels: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'],
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docUrl: 'https://open.bigmodel.cn/dev/api',
  },
  {
    id: 'qwen',
    name: '通义千问',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    suggestedModels: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    docUrl: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
  },
  {
    id: 'custom',
    name: '自定义兼容',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: '',
    suggestedModels: [],
    docUrl: undefined,
  },
]

export const DEFAULT_PROVIDER_ID: MobileProviderId = 'deepseek'

export function getProviderPreset(id: string | undefined): MobileProviderPreset {
  return (
    MOBILE_PROVIDER_PRESETS.find((item) => item.id === id) ??
    MOBILE_PROVIDER_PRESETS.find((item) => item.id === DEFAULT_PROVIDER_ID)!
  )
}

/** Ensure OpenAI-compatible bases end with `/v1` (except Zhipu paas/v4). */
export function normalizeChatBaseUrl(baseUrl: string, providerId?: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return getProviderPreset(providerId).defaultBaseUrl
  if (providerId === 'zhipu') return trimmed
  if (trimmed.endsWith('/v1') || trimmed.includes('/compatible-mode/v1')) return trimmed
  return `${trimmed}/v1`
}
