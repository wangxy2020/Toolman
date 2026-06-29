import { getModelTypeSupport, isOcrVisionModelId } from '@toolman/shared'
import { providerSupportsOpenAiVision } from '@toolman/model-gateway'
import { getProviderConfig, parseModelId } from '../provider.service'

/** Align with providerSupportsOpenAiVision (e.g. deepseek-v4-pro) and heuristics (gemma/qwen). */
export function resolveModelSupportsVision(modelId: string): boolean {
  const { providerId, model } = parseModelId(modelId)
  const providerConfig = getProviderConfig(providerId)
  if (providerConfig && providerSupportsOpenAiVision(providerConfig, model)) {
    return true
  }
  return getModelTypeSupport(model).vision
}

export function isOcrChatModel(modelId: string): boolean {
  const { model } = parseModelId(modelId)
  return isOcrVisionModelId(model)
}
