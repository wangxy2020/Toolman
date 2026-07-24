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

/** Normalize display-ish model ids (`Kimi K3` → `kimi-k3`). */
export function normalizeOpenAiCompatibleModelKey(model: string): string {
  return model.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-')
}

/**
 * Kimi K3 fixes temperature/top_p/n/penalties server-side; sending them returns HTTP 400.
 * @see https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
 */
export function isKimiFixedSamplingModelId(model: string): boolean {
  const key = normalizeOpenAiCompatibleModelKey(model)
  return /(^|\/)kimi-k3(?:$|[-:])/.test(key)
}

export function isMoonshotCompatibleBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  const base = (baseUrl ?? '').toLowerCase()
  return base.includes('moonshot') || base.includes('kimi.ai')
}

/** True when OpenAI-compatible requests must omit sampling knobs (temperature, etc.). */
export function shouldOmitOpenAiSamplingParams(
  _config: ProviderConfig,
  model: string,
): boolean {
  return isKimiFixedSamplingModelId(model)
}

export function resolveOpenAiModelName(config: ProviderConfig, model: string): string {
  const base = (config.baseUrl ?? '').toLowerCase()
  if (base.includes('deepseek')) {
    return resolveDeepSeekChatOptions(model).model
  }
  if (isMoonshotCompatibleBaseUrl(config.baseUrl) || isKimiFixedSamplingModelId(model)) {
    return normalizeOpenAiCompatibleModelKey(model)
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

const OCR_VISION_MODEL = /glm[-_]ocr/i

/** Gemma 3/4 via Ollama /v1 streaming puts all tokens in reasoning with empty content (ollama#15288). */
const GEMMA_THINKING_OLLAMA_MODEL = /gemma[-_]?(?:3|4)/i

/** Qwen3 via Ollama /v1 often leaves content empty and fills reasoning/thinking instead. */
const QWEN_THINKING_OLLAMA_MODEL = /qwen3/i

export function isOcrVisionModelId(model: string): boolean {
  return OCR_VISION_MODEL.test(model.trim().toLowerCase())
}

export function isGemmaThinkingOllamaModelId(model: string): boolean {
  const key = model.trim().toLowerCase()
  if (GEMMA_THINKING_OLLAMA_MODEL.test(key)) return true
  if (/^gemma4:latest(?:@[\w.-]+)?$/.test(key)) return true
  // Ollama 常用标签 gemma:latest 指向 Gemma 4 系列
  if (/^gemma:latest(?:@[\w.-]+)?$/.test(key)) return true
  return false
}

export function isQwenThinkingOllamaModelId(model: string): boolean {
  return QWEN_THINKING_OLLAMA_MODEL.test(model.trim().toLowerCase())
}

/** Ollama native /api/chat models that expose separate thinking + content fields. */
export function isOllamaNativeThinkingModelId(model: string): boolean {
  const key = model.trim()
  return isGemmaThinkingOllamaModelId(key) || isQwenThinkingOllamaModelId(key)
}

function ollamaRoutesReasoningAsAnswer(model: string): boolean {
  return (
    isOcrVisionModelId(model) ||
    isGemmaThinkingOllamaModelId(model) ||
    isQwenThinkingOllamaModelId(model)
  )
}

/** Ollama 视觉/OCR 与 Gemma 3/4：关闭 think；Gemma 仍会在 /v1 流式里走 reasoning 字段，由 shouldRouteThinkingAsAnswer 兜底 */
export function resolveOllamaExtraBody(
  config: ProviderConfig,
  model: string,
): Record<string, unknown> | undefined {
  if (config.type !== 'ollama') return undefined
  if (!ollamaRoutesReasoningAsAnswer(model)) return undefined
  return { think: false }
}

export function resolveOpenAiMaxTokens(
  config: ProviderConfig,
  model: string,
  maxTokens?: number,
): number | undefined {
  if (maxTokens != null && maxTokens > 0) return maxTokens
  if (config.type === 'ollama' && isOcrVisionModelId(model)) return 8192
  if (config.type === 'ollama' && isGemmaThinkingOllamaModelId(model)) return 4096
  return maxTokens
}

export function shouldRouteThinkingAsAnswer(config: ProviderConfig, model: string): boolean {
  // glm-ocr 常只输出 reasoning 字段；Gemma 有 reasoning + content 时应分开展示
  return config.type === 'ollama' && isOcrVisionModelId(model)
}
