import {
  AssistantParametersSchema,
  ModelIdSchema,
  type Assistant,
  type TaskTokenBudgetPreset,
  inferTaskTokenBudgetPreset,
} from '@toolman/shared'

import { getAssistantRow } from '../assistant.service'
import { parseModelId } from '../provider.service'
import { getProviderRow } from '../provider/crud'
import { resolvePlannerModelIdFromRuntime } from '../runtime-app-settings.service'

const DEFAULT_ASSISTANT_PARAMETERS = AssistantParametersSchema.parse({})

export function parseAssistantParametersJson(
  parametersJson: string | null | undefined,
): Assistant['parameters'] {
  if (!parametersJson?.trim()) return { ...DEFAULT_ASSISTANT_PARAMETERS }
  try {
    const parsed = AssistantParametersSchema.safeParse(JSON.parse(parametersJson))
    return parsed.success ? parsed.data : { ...DEFAULT_ASSISTANT_PARAMETERS }
  } catch {
    return { ...DEFAULT_ASSISTANT_PARAMETERS }
  }
}

export function resolveProviderTypeForModelId(modelId: string | undefined | null): string | null {
  const trimmed = modelId?.trim()
  if (!trimmed) return null

  try {
    const { providerId } = parseModelId(trimmed)
    return getProviderRow(providerId)?.type ?? null
  } catch {
    return null
  }
}

export function isLocalInferenceModelId(modelId: string | undefined | null): boolean {
  return resolveProviderTypeForModelId(modelId) === 'ollama'
}

export function inferTaskBudgetPresetForModels(
  plannerModelId?: string | null,
  executorModelId?: string | null,
): TaskTokenBudgetPreset {
  if (isLocalInferenceModelId(plannerModelId) || isLocalInferenceModelId(executorModelId)) {
    return 'local'
  }
  return inferTaskTokenBudgetPreset(plannerModelId ?? executorModelId)
}

export function resolveTaskPlannerModelId(options: {
  explicitPlannerModelId?: string
  assistantId?: string
}): string | undefined {
  const explicit = options.explicitPlannerModelId?.trim()
  if (explicit) {
    ModelIdSchema.parse(explicit)
    return explicit
  }

  if (options.assistantId) {
    const assistant = getAssistantRow(options.assistantId)
    if (assistant) {
      const params = parseAssistantParametersJson(assistant.parametersJson)
      const fromAssistant = params.plannerModelId?.trim()
      if (fromAssistant) {
        ModelIdSchema.parse(fromAssistant)
        return fromAssistant
      }

      if (assistant.modelId?.trim()) {
        ModelIdSchema.parse(assistant.modelId)
        return assistant.modelId
      }

      const globalPlanner = resolvePlannerModelIdFromRuntime()
      if (globalPlanner) {
        ModelIdSchema.parse(globalPlanner)
        return globalPlanner
      }
    }
  }

  const globalPlanner = resolvePlannerModelIdFromRuntime()
  if (globalPlanner) {
    ModelIdSchema.parse(globalPlanner)
    return globalPlanner
  }

  return undefined
}

export function resolveTaskPlannerModelCandidates(options: {
  explicitPlannerModelId?: string
  assistantId?: string
}): string[] {
  const candidates: string[] = []
  const push = (modelId: string | undefined | null) => {
    const trimmed = modelId?.trim()
    if (!trimmed || candidates.includes(trimmed)) return
    candidates.push(trimmed)
  }

  if (options.assistantId) {
    const assistant = getAssistantRow(options.assistantId)
    if (assistant) {
      const params = parseAssistantParametersJson(assistant.parametersJson)
      push(params.plannerModelId)
      push(assistant.modelId)
    }
  }

  push(options.explicitPlannerModelId)
  push(resolvePlannerModelIdFromRuntime())

  if (candidates.length === 0) {
    push(resolveTaskPlannerModelId(options))
  }

  return candidates
}

export function resolveTaskExecutorModelId(options: {
  explicitExecutorModelId?: string
  assistantId?: string,
}): string | undefined {
  const explicit = options.explicitExecutorModelId?.trim()
  if (explicit) {
    ModelIdSchema.parse(explicit)
    return explicit
  }

  if (options.assistantId) {
    const assistant = getAssistantRow(options.assistantId)
    if (assistant?.modelId?.trim()) {
      return assistant.modelId
    }
  }

  return undefined
}
