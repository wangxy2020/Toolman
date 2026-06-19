import type { ProviderType } from '@toolman/shared'

export type ProviderPresetId =
  | 'ollama'
  | 'deepseek'
  | 'openai'
  | 'anthropic'
  | 'moonshot'
  | 'zhipu'
  | 'qwen'
  | 'openai_compatible'

export interface ProviderPreset {
  id: ProviderPresetId
  name: string
  type: ProviderType
  defaultBaseUrl: string
  docUrl: string
  modelsDocUrl: string
  apiKeyUrl?: string
  isLocal: boolean
  /** 不可删除，仅可禁用 */
  locked?: boolean
}

export const OLLAMA_PRESET: ProviderPreset = {
  id: 'ollama',
  name: 'Ollama',
  type: 'ollama',
  defaultBaseUrl: 'http://127.0.0.1:11434',
  docUrl: 'https://github.com/ollama/ollama',
  modelsDocUrl: 'https://ollama.com/library',
  isLocal: true,
  locked: true,
}

export const NETWORK_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: '深度求索',
    type: 'openai_compatible',
    defaultBaseUrl: 'https://api.deepseek.com',
    docUrl: 'https://platform.deepseek.com/api-docs',
    modelsDocUrl: 'https://platform.deepseek.com/api-docs',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    isLocal: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    docUrl: 'https://platform.openai.com/docs',
    modelsDocUrl: 'https://platform.openai.com/docs/models',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    isLocal: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    docUrl: 'https://docs.anthropic.com',
    modelsDocUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    isLocal: false,
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    type: 'openai_compatible',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    docUrl: 'https://platform.moonshot.cn/docs',
    modelsDocUrl: 'https://platform.moonshot.cn/docs',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    isLocal: false,
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    type: 'openai_compatible',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    docUrl: 'https://open.bigmodel.cn/dev/api',
    modelsDocUrl: 'https://open.bigmodel.cn/modelcenter/square',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    isLocal: false,
  },
  {
    id: 'qwen',
    name: '通义千问',
    type: 'openai_compatible',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docUrl: 'https://help.aliyun.com/zh/model-studio',
    modelsDocUrl: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    isLocal: false,
  },
]

export const ALL_PROVIDER_PRESETS: ProviderPreset[] = [OLLAMA_PRESET, ...NETWORK_PROVIDER_PRESETS]

/** DeepSeek 当前可用模型（与主进程 preset 列表保持一致） */
export const DEEPSEEK_PRESET_MODELS = [
  { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
  { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro' },
] as const

export function getPresetById(id: ProviderPresetId): ProviderPreset | undefined {
  return ALL_PROVIDER_PRESETS.find((preset) => preset.id === id)
}
