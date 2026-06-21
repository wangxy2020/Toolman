import type { Assistant, Provider } from '@toolman/shared'
import { isChatModelEntry } from '@toolman/shared'

export const MAX_PARALLEL_MODELS = 4

/** 从 providerId:modelName 取出模型名（支持 gemma4:26b 等含冒号的名称） */
export function modelNameFromId(modelId: string | null | undefined): string {
  if (!modelId) return ''
  const sep = modelId.indexOf(':')
  return sep === -1 ? modelId : modelId.slice(sep + 1)
}

export function formatModelId(providerId: string, model: string): string {
  return `${providerId}:${model}`
}

export function buildModelOptions(providers: Provider[]) {
  return providers.flatMap((provider) => {
    const chatModels = provider.models.filter((m) => isChatModelEntry(m))
    const models = chatModels.length > 0 ? chatModels : provider.models.filter((m) => isChatModel(m.id))
    return models.length > 0
      ? models.map((m) => ({
          modelId: formatModelId(provider.id, m.id),
          label: `${provider.name} / ${m.name}`,
        }))
      : [
          {
            modelId: formatModelId(
              provider.id,
              provider.type === 'ollama' ? 'gemma4:latest' : 'gpt-4o-mini',
            ),
            label: `${provider.name}（默认）`,
          },
        ]
  })
}

function isChatModel(modelId: string): boolean {
  return !/bge|embed|nomic/i.test(modelId)
}

export function pickDefaultModelId(
  assistants: Assistant[],
  providers: Provider[],
  preferredModel = 'gemma4:latest',
): string | null {
  const fromAssistant = assistants[0]?.modelId
  if (fromAssistant) return fromAssistant

  for (const provider of providers) {
    const preferred = provider.models.find((m) => m.id === preferredModel)
    if (preferred) return formatModelId(provider.id, preferred.id)
  }

  for (const provider of providers) {
    if (provider.models.length > 0) {
      return formatModelId(provider.id, provider.models[0].id)
    }
  }

  return null
}

export function pickDefaultModelIds(
  assistants: Assistant[],
  providers: Provider[],
): string[] {
  const modelId = pickDefaultModelId(assistants, providers)
  return modelId ? [modelId] : []
}

export function isModelIdAvailable(modelId: string, providers: Provider[]): boolean {
  const sep = modelId.indexOf(':')
  if (sep === -1) return false
  const providerId = modelId.slice(0, sep)
  const model = modelId.slice(sep + 1)
  const provider = providers.find((p) => p.id === providerId)
  if (!provider) return false
  const match = provider.models.some((m) => m.id === model)
  if (!match) return false
  const entry = provider.models.find((m) => m.id === model)
  return entry ? isChatModelEntry(entry) : isChatModel(model)
}

export function providerNameFromModelId(modelId: string, providers: Provider[]): string {
  const sep = modelId.indexOf(':')
  if (sep === -1) return ''
  const providerId = modelId.slice(0, sep)
  return providers.find((p) => p.id === providerId)?.name ?? ''
}

export function normalizeModelIds(
  modelIds: string[],
  providers: Provider[],
  assistants: Assistant[],
): string[] {
  const valid = modelIds.filter((id) => isModelIdAvailable(id, providers))
  if (valid.length > 0) return valid.slice(0, MAX_PARALLEL_MODELS)
  return pickDefaultModelIds(assistants, providers)
}

export function toggleModelId(current: string[], modelId: string): string[] {
  if (current.includes(modelId)) {
    if (current.length === 1) return current
    return current.filter((id) => id !== modelId)
  }
  if (current.length >= MAX_PARALLEL_MODELS) return current
  return [...current, modelId]
}
