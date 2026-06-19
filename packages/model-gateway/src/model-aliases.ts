import type { ProviderConfig } from './types.js'

export const DEEPSEEK_SUPPORTED_MODEL_IDS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const

/** @deprecated 已作废的 DeepSeek 模型别名，获取模型列表时过滤，请求层仍兼容旧配置 */
export const DEPRECATED_DEEPSEEK_MODEL_IDS = [
  'deepseek-chat',
  'deepseek-reasoner',
] as const

export const DEEPSEEK_PRESET_MODELS = [
  { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
  { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro' },
] as const

export type DeepSeekSupportedModelId = (typeof DEEPSEEK_SUPPORTED_MODEL_IDS)[number]

export type DeepSeekChatOptions = {
  model: string
  extraBody?: Record<string, unknown>
}

/** 规范化用户输入的模型 ID（空格/下划线转连字符，保留别名） */
export function normalizeDeepSeekModelKey(model: string): string {
  return model.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-')
}

export function isDeepSeekSupportedModelId(model: string): boolean {
  const key = normalizeDeepSeekModelKey(model)
  if (isDeprecatedDeepSeekModelId(key)) return false
  return DEEPSEEK_SUPPORTED_MODEL_IDS.includes(key as DeepSeekSupportedModelId)
}

export function isDeprecatedDeepSeekModelId(model: string): boolean {
  const key = normalizeDeepSeekModelKey(model)
  return DEPRECATED_DEEPSEEK_MODEL_IDS.includes(
    key as (typeof DEPRECATED_DEEPSEEK_MODEL_IDS)[number],
  )
}

/**
 * 将已作废的 DeepSeek 模型别名映射为当前 API 接受的请求参数（兼容旧会话配置）。
 */
export function resolveDeepSeekChatOptions(model: string): DeepSeekChatOptions {
  const key = normalizeDeepSeekModelKey(model)

  if (key === 'deepseek-reasoner') {
    return {
      model: 'deepseek-v4-flash',
      extraBody: {
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      },
    }
  }

  if (key === 'deepseek-chat') {
    return {
      model: 'deepseek-v4-flash',
      extraBody: {
        thinking: { type: 'disabled' },
      },
    }
  }

  if (key === 'deepseek-v4-pro' || key === 'deepseek-v4-flash') {
    return { model: key }
  }

  return { model: key }
}

export function resolveOpenAiModelName(config: ProviderConfig, model: string): string {
  const base = (config.baseUrl ?? '').toLowerCase()
  if (base.includes('deepseek')) {
    return resolveDeepSeekChatOptions(model).model
  }
  return model.trim()
}

export function resolveDeepSeekExtraBody(
  config: ProviderConfig,
  model: string,
): Record<string, unknown> | undefined {
  const base = (config.baseUrl ?? '').toLowerCase()
  if (!base.includes('deepseek')) return undefined
  return resolveDeepSeekChatOptions(model).extraBody
}

export function deepSeekModelSupportsVision(model: string): boolean {
  return resolveDeepSeekChatOptions(model).model === 'deepseek-v4-pro'
}

export function providerSupportsOpenAiVision(config: ProviderConfig, model: string): boolean {
  const base = (config.baseUrl ?? '').toLowerCase()
  if (base.includes('deepseek')) {
    return deepSeekModelSupportsVision(model)
  }
  return true
}

/** @deprecated 使用 normalizeDeepSeekModelKey */
export function normalizeDeepSeekModelId(model: string): string {
  return normalizeDeepSeekModelKey(model)
}
