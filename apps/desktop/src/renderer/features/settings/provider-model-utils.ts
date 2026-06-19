import type { Provider, ProviderModel, ProviderType } from '@toolman/shared'
import {
  enrichProviderModel,
  getDefaultModelTypes,
  getDisplayModelTypes,
  getModelTypeSupport,
  hasSavedModelTypes,
  inferModelGroup,
  isChatModelEntry,
  isEmbeddingModelId,
  normalizeModelTypes,
  type ModelTypeKey,
  type ModelTypeState,
} from '@toolman/shared'
import type { ProviderPreset, ProviderPresetId } from './provider-presets'

export type { ModelTypeKey, ModelTypeState }
export {
  enrichProviderModel,
  getDefaultModelTypes,
  getDisplayModelTypes,
  getModelTypeSupport,
  hasSavedModelTypes,
  inferModelGroup,
  isChatModelEntry,
  isEmbeddingModelId,
  normalizeModelTypes,
}

export type ModelTypeSupport = ModelTypeState

export type ModelCategory =
  | 'all'
  | 'reasoning'
  | 'vision'
  | 'web'
  | 'free'
  | 'embedding'
  | 'rerank'
  | 'tools'

export const MODEL_TYPE_OPTIONS: Array<{ key: ModelTypeKey; label: string }> = [
  { key: 'vision', label: '视觉' },
  { key: 'web', label: '联网' },
  { key: 'reasoning', label: '推理' },
  { key: 'tools', label: '工具' },
  { key: 'rerank', label: '重排' },
  { key: 'embedding', label: '嵌入' },
]

export const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  all: '全部',
  reasoning: '推理',
  vision: '视觉',
  web: '联网',
  free: '免费',
  embedding: '嵌入',
  rerank: '重排',
  tools: '工具',
}

export function createProviderModel(
  id: string,
  options?: { name?: string; group?: string },
): ProviderModel {
  return enrichProviderModel({
    id,
    name: options?.name?.trim() || id,
    group: options?.group,
  })
}

const DEEPSEEK_SUPPORTED_MODEL_IDS = new Set([
  'deepseek-v4-flash',
  'deepseek-v4-pro',
])

export function normalizeDeepSeekModelId(model: string): string {
  return model.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-')
}

export function isDeepSeekSupportedModelId(model: string): boolean {
  return DEEPSEEK_SUPPORTED_MODEL_IDS.has(normalizeDeepSeekModelId(model))
}

export function isFreeModel(model: ProviderModel, providerType?: ProviderType): boolean {
  if (providerType === 'ollama') return true
  if (model.inputPrice !== undefined) return model.inputPrice <= 0
  return false
}

export function modelMatchesCategory(
  model: ProviderModel,
  category: ModelCategory,
  providerType?: ProviderType,
): boolean {
  if (category === 'all') return true
  const types = getDisplayModelTypes(model)
  if (category === 'embedding') return types.embedding
  if (category === 'vision') return types.vision
  if (category === 'reasoning') return types.reasoning
  if (category === 'web') return types.web
  if (category === 'tools') return types.tools
  if (category === 'rerank') return types.rerank
  if (category === 'free') return isFreeModel(model, providerType)
  return true
}

export function groupProviderModels(models: ProviderModel[]) {
  const groups = new Map<string, ProviderModel[]>()

  for (const model of models) {
    const groupKey = inferModelGroup(model.id, model.group)
    const list = groups.get(groupKey) ?? []
    list.push(model)
    groups.set(groupKey, list)
  }

  return [...groups.entries()].map(([key, items]) => ({
    key,
    items: items.sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

export function isEmbeddingModel(modelId: string): boolean {
  return isEmbeddingModelId(modelId)
}

export function isChatModel(modelId: string): boolean {
  const support = getModelTypeSupport(modelId)
  return !support.embedding && !support.rerank
}

export function modelCapabilities(modelId: string): {
  embedding: boolean
  vision: boolean
  reasoning: boolean
  tools: boolean
} {
  const types = getDefaultModelTypes(modelId)
  return {
    embedding: types.embedding,
    vision: types.vision,
    reasoning: types.reasoning,
    tools: types.tools,
  }
}

export function groupModels(models: Array<{ id: string; name: string; group?: string }>) {
  return groupProviderModels(
    models.map((m) => enrichProviderModel(m)),
  )
}

export function readProviderPresetId(provider: Provider): ProviderPresetId | null {
  if (provider.presetId) return provider.presetId as ProviderPresetId
  if (provider.type === 'ollama') return 'ollama'
  return null
}

export function matchProviderToPreset(provider: Provider, preset: ProviderPreset): boolean {
  const presetId = readProviderPresetId(provider)
  if (presetId) return presetId === preset.id
  if (preset.id === 'ollama' && provider.type === 'ollama') return true
  if (provider.type !== preset.type) return false
  const providerRoot = normalizeBaseUrlForCompare(provider.baseUrl ?? '')
  const presetRoot = normalizeBaseUrlForCompare(preset.defaultBaseUrl)
  return providerRoot === presetRoot
}

function normalizeBaseUrlForCompare(url: string): string {
  return url
    .trim()
    .replace(/\/$/, '')
    .replace(/\/v1$/, '')
    .toLowerCase()
}

export function normalizeProviderBaseUrl(type: ProviderType, baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (type === 'ollama') {
    return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
  }
  if (type === 'openai' || type === 'openai_compatible' || type === 'azure_openai' || type === 'google') {
    return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
  }
  return trimmed
}

export function displayBaseUrl(type: ProviderType, baseUrl: string | null, preset: ProviderPreset): string {
  const raw = (baseUrl ?? preset.defaultBaseUrl).replace(/\/v1\/?$/, '').replace(/\/$/, '')
  if (type === 'ollama') return raw || 'http://127.0.0.1:11434'
  return raw || preset.defaultBaseUrl.replace(/\/v1\/?$/, '')
}

export function previewChatEndpoint(type: ProviderType, baseUrl: string | null, preset: ProviderPreset): string {
  const display = displayBaseUrl(type, baseUrl, preset)
  if (type === 'ollama') return `${display}/api/chat`
  if (type === 'anthropic') return `${display.replace(/\/$/, '')}/v1/messages`
  const root = display.replace(/\/$/, '')
  return root.endsWith('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`
}

export function listEnabledModels(providers: Provider[]) {
  return providers
    .filter((provider) => provider.isEnabled)
    .flatMap((provider) =>
      provider.models.map((model) => {
        const types = getDisplayModelTypes(model)
        return {
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.type,
          modelId: model.id,
          modelName: model.name,
          isChat: isChatModelEntry(model),
          isEmbedding: types.embedding,
          isRerank: types.rerank,
        }
      }),
    )
}

/** @deprecated 使用 getDisplayModelTypes */
export function inferModelTypes(model: Pick<ProviderModel, 'id' | 'types'>): ModelTypeState {
  return getDisplayModelTypes(model)
}
