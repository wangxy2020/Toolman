import {
  AssistantParametersSchema,
  ModelIdSchema,
  type TaskTokenBudgetPreset,
  inferTaskTokenBudgetPreset,
} from '@toolman/shared'

import { getAssistantRow } from '../assistant.service'
import { parseModelId } from '../provider.service'
import { getProviderRow } from '../provider/crud'
import { resolvePlannerModelIdFromRuntime } from '../runtime-app-settings.service'

export function parseAssistantParametersJson(parametersJson: string): Record<string, unknown> {
  try {
    return JSON.parse(parametersJson) as Record<string, unknown>
  } catch {
    return {}
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
      const params = AssistantParametersSchema.safeParse(
        parseAssistantParametersJson(assistant.parametersJson),
      )
      const fromAssistant = params.success ? params.data.plannerModelId?.trim() : undefined
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
      const params = AssistantParametersSchema.safeParse(
        parseAssistantParametersJson(assistant.parametersJson),
      )
      push(params.success ? params.data.plannerModelId : undefined)
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

export function shouldUseLocalTaskReflectionStrategy(modelId: string | undefined | null): boolean {
  return isLocalInferenceModelId(modelId)
}
