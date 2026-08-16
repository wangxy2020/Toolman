import { createModelGateway, ProviderError } from '@toolman/model-gateway'

import {
  parseTaskReflectionFromText,
  type AgentTask,
  type TaskReflectionResult,
} from '@toolman/shared'

import { getProviderConfig, parseModelId } from '../../provider.service'
import { listTaskArtifacts } from '../artifact.service'
import { resolveTaskPlannerModelCandidates } from '../resolve-models'
import { updateAgentTaskRecord } from '../store'
import { buildReflectionSystemPrompt, buildReflectionUserPrompt } from './reflection-prompt'
import { rejectReflectionPassWithoutEvidence } from './reflection-evidence'
import {
  applyReflectionTokenUsage,
  buildReflectionParseFallback,
} from './reflection-verdict'
import { ReflectionError, type TaskReflectionOptions } from './reflection-types'

const gateway = createModelGateway()

async function callReflectionModelWithId(
  task: AgentTask,
  modelId: string,
  options: TaskReflectionOptions,
): Promise<{ reflection: TaskReflectionResult; task: AgentTask }> {
  const { providerId, model } = parseModelId(modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    throw new ReflectionError('反思模型 Provider 不可用', 'MODEL_UNAVAILABLE')
  }

  const artifacts = listTaskArtifacts({ taskId: task.id }).items
  const completion = await gateway.chatComplete(providerConfig, {
    model,
    messages: [
      { role: 'system', content: buildReflectionSystemPrompt() },
      { role: 'user', content: buildReflectionUserPrompt(task, artifacts) },
    ],
    temperature: 0.1,
    maxTokens: Math.min(task.budget.maxReflectionTokens, 2048),
    signal: options.signal,
  })

  let reflection: TaskReflectionResult
  try {
    reflection = parseTaskReflectionFromText(completion.content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reflection = buildReflectionParseFallback(task, `反思 JSON 解析失败：${message}`)
  }

  if (reflection.verdict === 'replan' && (!reflection.nextSteps || reflection.nextSteps.length === 0)) {
    reflection = buildReflectionParseFallback(task, 'replan 结果缺少 nextSteps，继续执行剩余步骤。')
  }

  reflection = rejectReflectionPassWithoutEvidence(task, reflection)

  const withUsage = applyReflectionTokenUsage(task, completion.usage)
  return { reflection, task: withUsage }
}

export async function callReflectionModel(
  task: AgentTask,
  options: TaskReflectionOptions,
): Promise<{ reflection: TaskReflectionResult; task: AgentTask }> {
  const candidates = resolveTaskPlannerModelCandidates({
    assistantId: task.assistantId,
    explicitPlannerModelId: task.plannerModelId,
  })
  if (candidates.length === 0) {
    throw new ReflectionError('未配置反思模型', 'MODEL_UNAVAILABLE')
  }

  let lastError: unknown
  for (let index = 0; index < candidates.length; index++) {
    const modelId = candidates[index]!
    try {
      const reflected = await callReflectionModelWithId(task, modelId, options)
      if (index > 0) {
        reflected.task = updateAgentTaskRecord(reflected.task.id, { plannerModelId: modelId })
      }
      return reflected
    } catch (error) {
      lastError = error
      const hasFallback = index < candidates.length - 1
      if (error instanceof ReflectionError) {
        if (hasFallback && (error.code === 'REFLECTION_PARSE_FAILED' || error.code === 'MODEL_UNAVAILABLE')) {
          continue
        }
        throw error
      }
      if (error instanceof ProviderError && hasFallback) {
        continue
      }
      if (error instanceof ProviderError) {
        throw new ReflectionError(error.message, 'MODEL_UNAVAILABLE')
      }
      throw error
    }
  }

  if (lastError instanceof ReflectionError) {
    throw lastError
  }
  if (lastError instanceof ProviderError) {
    throw new ReflectionError(lastError.message, 'MODEL_UNAVAILABLE')
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new ReflectionError(message, 'REFLECTION_PARSE_FAILED')
}
