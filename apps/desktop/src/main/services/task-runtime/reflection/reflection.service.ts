import { createModelGateway, ProviderError } from '@toolman/model-gateway'

import {
  TaskReflectInputSchema,
  normalizeReflectionVerdict,
  parseTaskReflectionFromText,
  type AgentTask,
  type TaskReflectionResult,
} from '@toolman/shared'

import { getProviderConfig, parseModelId } from '../../provider.service'
import { logStructured } from '../../structured-log.service'
import { listTaskArtifacts } from '../artifact.service'
import { taskPlanToStepRecords } from '../planner/plan-to-steps'
import { ensureExecutableTaskPlan } from '../planner/plan-repair'
import {
  resolveTaskPlannerModelCandidates,
} from '../resolve-models'
import {
  getAgentTask,
  releaseAgentTaskLock,
  replaceTaskPendingSteps,
  tryAcquireAgentTaskLock,
  updateAgentTaskRecord,
} from '../store'
import { isTerminalTaskStatus } from '../state-machine'
import { emitTaskFinished, emitTaskReflection } from '../task-event.service'
import { buildReflectionSystemPrompt, buildReflectionUserPrompt } from './reflection-prompt'
import { rejectReflectionPassWithoutEvidence, validateTaskPassEvidence } from './reflection-evidence'

const gateway = createModelGateway()

export class ReflectionError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'LOCK_HELD' | 'INVALID_STATE' | 'MODEL_UNAVAILABLE' | 'REFLECTION_PARSE_FAILED',
  ) {
    super(message)
    this.name = 'ReflectionError'
  }
}

export interface TaskReflectionOptions {
  workerId?: string
  signal?: AbortSignal
  stepId?: string
}

export interface TaskReflectionOutput {
  task: AgentTask
  reflection: TaskReflectionResult
  verdict: ReturnType<typeof normalizeReflectionVerdict>
}

function assertTaskReflectable(task: AgentTask): void {
  if (isTerminalTaskStatus(task.status)) {
    throw new ReflectionError('任务已结束，无法反思', 'INVALID_STATE')
  }
  if (task.status === 'paused') {
    throw new ReflectionError('任务已暂停，请先恢复', 'INVALID_STATE')
  }
}

function applyReflectionTokenUsage(
  task: AgentTask,
  usage?: { prompt?: number; completion?: number; total?: number },
): AgentTask {
  if (!usage) return task
  const reflectionTokens = usage.total ?? (usage.prompt ?? 0) + (usage.completion ?? 0)
  if (reflectionTokens <= 0) return task

  return updateAgentTaskRecord(task.id, {
    budget: {
      ...task.budget,
      used: {
        ...task.budget.used,
        reflection: task.budget.used.reflection + reflectionTokens,
        total: task.budget.used.total + reflectionTokens,
      },
    },
  })
}

function hasPendingExecutableWork(task: AgentTask): boolean {
  return task.history.some((step) => step.status === 'pending' && step.kind === 'tool')
}

function applyReflectionVerdict(
  task: AgentTask,
  reflection: TaskReflectionResult,
  verdict: ReturnType<typeof normalizeReflectionVerdict>,
): AgentTask {
  const metadata = {
    ...task.metadata,
    lastReflection: {
      verdict: reflection.verdict,
      reason: reflection.reason,
      summary: reflection.summary,
      at: Date.now(),
    },
  }

  if (verdict === 'fail') {
    const failed = updateAgentTaskRecord(task.id, {
      status: 'failed',
      metadata,
    })
    emitTaskFinished(failed, 'failed')
    return failed
  }

  if (verdict === 'replan') {
    const nextSteps = reflection.nextSteps ?? []
    const withSteps =
      nextSteps.length > 0
        ? replaceTaskPendingSteps(
            task.id,
            taskPlanToStepRecords(
              ensureExecutableTaskPlan({ goal: task.goal ?? task.title, steps: nextSteps }, task),
              task,
            ),
          )
        : task
    return updateAgentTaskRecord(withSteps.id, {
      status: 'pending',
      metadata,
    })
  }

  if (reflection.verdict === 'continue') {
    if (!hasPendingExecutableWork(task)) {
      const completed = updateAgentTaskRecord(task.id, {
        status: 'completed',
        currentStepId: null,
        metadata,
      })
      emitTaskFinished(completed, 'completed')
      return completed
    }
    return updateAgentTaskRecord(task.id, {
      status: 'pending',
      metadata,
    })
  }

  if (verdict === 'pass' && !hasPendingExecutableWork(task)) {
    const completed = updateAgentTaskRecord(task.id, {
      status: 'completed',
      currentStepId: null,
      metadata,
    })
    emitTaskFinished(completed, 'completed')
    return completed
  }

  return updateAgentTaskRecord(task.id, {
    status: 'pending',
    metadata,
  })
}

function buildReflectionParseFallback(task: AgentTask, reason: string): TaskReflectionResult {
  const pending = task.history.some((step) => step.status === 'pending' && step.kind === 'tool')
  if (pending) {
    return {
      verdict: 'continue',
      reason,
      summary: '反思结果不完整，继续执行剩余步骤。',
    }
  }

  const evidence = validateTaskPassEvidence(task)
  if (evidence.ok) {
    return {
      verdict: 'pass',
      reason,
      summary: '反思结果不完整，但工具步骤已有可验证产出。',
    }
  }

  return {
    verdict: 'fail',
    reason: evidence.reason,
    summary: `反思结果不完整，且缺少可验证产出：${evidence.reason}`,
  }
}

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

async function callReflectionModel(
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

/** Run reflection without acquiring the global task lock (caller must hold it). */
export async function performTaskReflection(
  task: AgentTask,
  options: TaskReflectionOptions = {},
): Promise<TaskReflectionOutput> {
  assertTaskReflectable(task)

  const stepId = options.stepId

  let working = updateAgentTaskRecord(task.id, { status: 'reflecting' })
  logStructured('task-runtime', 'info', `task reflection started: ${working.id}`)

  const reflected = await callReflectionModel(working, options)
  const verdict = normalizeReflectionVerdict(reflected.reflection.verdict)

  emitTaskReflection(reflected.task, {
    stepId,
    verdict,
    summary: reflected.reflection.summary ?? reflected.reflection.reason,
  })

  working = applyReflectionVerdict(reflected.task, reflected.reflection, verdict)

  logStructured(
    'task-runtime',
    'info',
    `task reflection completed: ${working.id} verdict=${verdict}`,
  )

  return {
    task: working,
    reflection: reflected.reflection,
    verdict,
  }
}

export async function runTaskReflection(input: unknown, options: TaskReflectionOptions = {}): Promise<TaskReflectionOutput> {
  const data = TaskReflectInputSchema.parse(input)
  let task = getAgentTask(data.taskId)
  if (!task) {
    throw new ReflectionError('任务不存在', 'NOT_FOUND')
  }

  assertTaskReflectable(task)

  const workerId = options.workerId ?? data.workerId ?? `reflection-${task.id.slice(0, 8)}`
  const locked = tryAcquireAgentTaskLock(task.id, workerId)
  if (!locked) {
    throw new ReflectionError('已有任务正在执行', 'LOCK_HELD')
  }

  const stepId = options.stepId ?? data.stepId

  try {
    return await performTaskReflection(task, { ...options, stepId })
  } catch (error) {
    if (error instanceof ProviderError) {
      const failed = updateAgentTaskRecord(task.id, { status: 'failed' })
      emitTaskFinished(failed, 'failed')
      throw new ReflectionError(error.message, 'MODEL_UNAVAILABLE')
    }

    if (error instanceof ReflectionError) {
      if (error.code !== 'LOCK_HELD' && error.code !== 'NOT_FOUND') {
        const failed = updateAgentTaskRecord(task.id, { status: 'failed' })
        emitTaskFinished(failed, 'failed')
      }
      throw error
    }

    const message = error instanceof Error ? error.message : String(error)
    const failed = updateAgentTaskRecord(task.id, { status: 'failed' })
    emitTaskFinished(failed, 'failed')
    throw new ReflectionError(message, 'REFLECTION_PARSE_FAILED')
  } finally {
    releaseAgentTaskLock(task.id)
  }
}
