import type { Assistant, Provider, Session } from '@toolman/shared'
import { isChatModelEntry } from '@toolman/shared'
import {
  resolveGroupProxyAssistantModelId,
} from '../group/group-agent-utils'

export const MAX_PARALLEL_MODELS = 4

/** Seed / unset marker — never send this name to a model provider. */
export const UNCONFIGURED_MODEL_NAME = 'unconfigured'

/** 从 providerId:modelName 取出模型名（支持 gemma4:26b 等含冒号的名称） */
export function modelNameFromId(modelId: string | null | undefined): string {
  if (!modelId) return ''
  const sep = modelId.indexOf(':')
  return sep === -1 ? modelId : modelId.slice(sep + 1)
}

export function formatModelId(providerId: string, model: string): string {
  return `${providerId}:${model}`
}

export function isNetworkProvider(provider: Pick<Provider, 'type'>): boolean {
  return provider.type !== 'ollama'
}

function isChatModel(modelId: string): boolean {
  return !/bge|embed|nomic/i.test(modelId) && modelId !== UNCONFIGURED_MODEL_NAME
}

function isSelectableChatModel(model: Provider['models'][number]): boolean {
  if (model.id === UNCONFIGURED_MODEL_NAME) return false
  return isChatModelEntry(model) || isChatModel(model.id)
}

/** Network providers first, then local Ollama — only models actually listed on the provider. */
export function listAvailableChatModelIds(
  providers: Provider[],
  options?: { networkOnly?: boolean },
): string[] {
  const enabled = providers.filter((provider) => provider.isEnabled !== false)
  const ordered = options?.networkOnly
    ? enabled.filter((provider) => isNetworkProvider(provider))
    : [
        ...enabled.filter((provider) => isNetworkProvider(provider)),
        ...enabled.filter((provider) => !isNetworkProvider(provider)),
      ]

  const out: string[] = []
  for (const provider of ordered) {
    for (const model of provider.models) {
      if (!isSelectableChatModel(model)) continue
      out.push(formatModelId(provider.id, model.id))
    }
  }
  return out
}

export function buildModelOptions(providers: Provider[]) {
  return providers.flatMap((provider) => {
    const chatModels = provider.models.filter((m) => isSelectableChatModel(m))
    return chatModels.map((m) => ({
      modelId: formatModelId(provider.id, m.id),
      label: `${provider.name} / ${m.name}`,
    }))
  })
}

/** Pinned assistant first — matches chat session default selection. */
export function resolvePrimaryAssistant(assistants: Assistant[]): Assistant | undefined {
  return assistants.find((assistant) => assistant.isPinned) ?? assistants[0]
}

/**
 * Resolve a chat model without inventing tags like gemma4:latest.
 * Prefer settings → available assistant model → network models → local models.
 */
export function pickDefaultModelId(
  assistants: Assistant[],
  providers: Provider[],
  preferredModel?: string,
  preferredModelId?: string | null,
): string | null {
  const fromSettings = preferredModelId?.trim()
  if (fromSettings && isModelIdAvailable(fromSettings, providers)) {
    return fromSettings
  }

  const fromAssistant = resolvePrimaryAssistant(assistants)?.modelId?.trim()
  if (fromAssistant && isModelIdAvailable(fromAssistant, providers)) {
    return fromAssistant
  }

  if (preferredModel) {
    for (const provider of providers) {
      if (provider.isEnabled === false) continue
      const match = provider.models.find(
        (m) => m.id === preferredModel && isSelectableChatModel(m),
      )
      if (match) return formatModelId(provider.id, match.id)
    }
  }

  return listAvailableChatModelIds(providers)[0] ?? null
}

export function pickDefaultModelIds(
  assistants: Assistant[],
  providers: Provider[],
  preferredModelId?: string | null,
): string[] {
  const modelId = pickDefaultModelId(assistants, providers, undefined, preferredModelId)
  return modelId ? [modelId] : []
}

export function isModelIdAvailable(modelId: string, providers: Provider[]): boolean {
  const sep = modelId.indexOf(':')
  if (sep === -1) return false
  const providerId = modelId.slice(0, sep)
  const model = modelId.slice(sep + 1)
  if (!model || model === UNCONFIGURED_MODEL_NAME) return false
  const provider = providers.find((p) => p.id === providerId)
  if (!provider || provider.isEnabled === false) return false
  const entry = provider.models.find((m) => m.id === model)
  if (!entry) return false
  return isSelectableChatModel(entry)
}

export function providerNameFromModelId(modelId: string, providers: Provider[]): string {
  const sep = modelId.indexOf(':')
  if (sep === -1) return ''
  const providerId = modelId.slice(0, sep)
  return providers.find((p) => p.id === providerId)?.name ?? ''
}

export function formatModelDisplayLabel(
  modelId: string | null | undefined,
  providers: Provider[],
): string {
  const modelName = modelNameFromId(modelId)
  if (!modelName || modelName === UNCONFIGURED_MODEL_NAME) return ''
  const providerName = modelId ? providerNameFromModelId(modelId, providers) : ''
  return providerName ? `${modelName} | ${providerName}` : modelName
}

export function normalizeModelIds(
  modelIds: string[],
  providers: Provider[],
  assistants: Assistant[],
  preferredModelId?: string | null,
): string[] {
  const valid = modelIds.filter((id) => isModelIdAvailable(id, providers))
  // Keep an explicit valid selection (course / header / multi-model). Only fall
  // back when nothing selectable remains — do not silently force the assistant
  // model over a different available choice.
  if (valid.length > 0) return valid.slice(0, MAX_PARALLEL_MODELS)
  return pickDefaultModelIds(assistants, providers, preferredModelId)
}

export function isUnconfiguredModelId(modelId: string | null | undefined): boolean {
  const name = modelNameFromId(modelId?.trim())
  return !name || name === UNCONFIGURED_MODEL_NAME
}

function isConfiguredAssistantModelId(modelId: string | null | undefined): modelId is string {
  const trimmed = modelId?.trim()
  if (!trimmed) return false
  return !isUnconfiguredModelId(trimmed)
}

/**
 * Agent-page breadcrumb / settings-aligned display:
 * group proxy → assistant settings model → header selection.
 * Seed `unconfigured` is not treated as a settings model (falls through to
 * selectedModelIds, which the page heals onto a real default).
 */
export function resolveHeaderChatModelIds(options: {
  activeSession?: Session | null
  activeAssistant?: Assistant | null
  selectedModelIds: string[]
  groupProxyMode?: boolean
}): string[] {
  const {
    activeSession,
    activeAssistant,
    selectedModelIds,
    groupProxyMode = false,
  } = options

  if (groupProxyMode && activeAssistant) {
    const modelId = resolveGroupProxyAssistantModelId(activeAssistant, activeSession).trim()
    return modelId ? [modelId] : selectedModelIds
  }

  // Path always mirrors the active agent's settings model (including unavailable
  // / retired provider ids), so switching agents never keeps the previous label.
  if (isConfiguredAssistantModelId(activeAssistant?.modelId)) {
    return [activeAssistant.modelId.trim()]
  }
  return selectedModelIds.length > 0 ? selectedModelIds : []
}

/**
 * Model used for generation:
 * group proxy → assistant settings → header selection.
 * Course topics follow the shared「课堂」agent model (no per-course override).
 */
export function resolveEffectiveChatModelIds(options: {
  activeSession?: Session | null
  activeAssistant?: Assistant | null
  providers: Provider[]
  selectedModelIds: string[]
  groupProxyMode?: boolean
}): string[] {
  const {
    activeSession,
    activeAssistant,
    providers,
    selectedModelIds,
    groupProxyMode = false,
  } = options

  if (groupProxyMode && activeAssistant) {
    const modelId = resolveGroupProxyAssistantModelId(activeAssistant, activeSession).trim()
    return modelId ? [modelId] : selectedModelIds
  }

  const assistantModelId = activeAssistant?.modelId?.trim()
  if (
    isConfiguredAssistantModelId(assistantModelId) &&
    isModelIdAvailable(assistantModelId, providers) &&
    selectedModelIds.length <= 1
  ) {
    return [assistantModelId]
  }
  // Prefer the assistant's configured model even when the provider list is stale.
  if (isConfiguredAssistantModelId(assistantModelId) && selectedModelIds.length <= 1) {
    return [assistantModelId]
  }
  return selectedModelIds
}

export function toggleModelId(current: string[], modelId: string): string[] {
  if (current.includes(modelId)) {
    if (current.length === 1) return current
    return current.filter((id) => id !== modelId)
  }
  if (current.length >= MAX_PARALLEL_MODELS) return current
  return [...current, modelId]
}
