import { createModelGateway, ProviderError } from '@toolman/model-gateway'

import {
  TaskPlanInputSchema,
  parseTaskPlanFromText,
  type AgentTask,
  type TaskPlan,
} from '@toolman/shared'

import { getProviderConfig, parseModelId } from '../../provider.service'
import { logStructured } from '../../structured-log.service'
import { resolveTaskPlannerModelCandidates } from '../resolve-models'
import {
  getAgentTask,
  releaseAgentTaskLock,
  replaceTaskPendingSteps,
  tryAcquireAgentTaskLock,
  updateAgentTaskRecord,
} from '../store'
import { isTerminalTaskStatus } from '../state-machine'
import { emitTaskFinished } from '../task-event.service'
import { runTaskExecutor } from '../executor/executor.service'
import { buildPlannerSystemPrompt, buildPlannerUserPrompt } from './planner-prompt'
import { countExecutablePlanSteps, taskPlanToStepRecords } from './plan-to-steps'
import { ensureExecutableTaskPlan } from './plan-repair'

const gateway = createModelGateway()

export class PlannerError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'LOCK_HELD' | 'INVALID_STATE' | 'MODEL_UNAVAILABLE' | 'PLAN_PARSE_FAILED',
  ) {
    super(message)
    this.name = 'PlannerError'
  }
}

export interface TaskPlannerOptions {
  workerId?: string
  signal?: AbortSignal
  execute?: boolean
}

function assertTaskPlannable(task: AgentTask): void {
  if (isTerminalTaskStatus(task.status)) {
    throw new PlannerError('任务已结束，无法规划', 'INVALID_STATE')
  }
  if (task.status === 'paused') {
    throw new PlannerError('任务已暂停，请先恢复', 'INVALID_STATE')
  }
  if (task.status === 'executing' || task.status === 'planning') {
    throw new PlannerError(`任务当前状态 ${task.status} 不可规划`, 'INVALID_STATE')
  }
}

function applyPlannerTokenUsage(
  task: AgentTask,
  usage?: { prompt?: number; completion?: number; total?: number },
): AgentTask {
  if (!usage) return task
  const plannerTokens = usage.total ?? (usage.prompt ?? 0) + (usage.completion ?? 0)
  if (plannerTokens <= 0) return task

  const budget = {
    ...task.budget,
    used: {
      ...task.budget.used,
      planner: task.budget.used.planner + plannerTokens,
      total: task.budget.used.total + plannerTokens,
    },
  }

  return updateAgentTaskRecord(task.id, { budget })
}

async function callPlannerModelWithId(
  task: AgentTask,
  modelId: string,
  options: TaskPlannerOptions,
): Promise<{ plan: TaskPlan; task: AgentTask }> {
  const { providerId, model } = parseModelId(modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    throw new PlannerError('规划模型 Provider 不可用', 'MODEL_UNAVAILABLE')
  }

  const completion = await gateway.chatComplete(providerConfig, {
    model,
    messages: [
      { role: 'system', content: buildPlannerSystemPrompt(task) },
      { role: 'user', content: buildPlannerUserPrompt(task) },
    ],
    temperature: 0.2,
    maxTokens: Math.min(task.budget.maxPlannerTokens, 4096),
    signal: options.signal,
  })

  let plan: TaskPlan
  try {
    plan = ensureExecutableTaskPlan(parseTaskPlanFromText(completion.content), task)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new PlannerError(`规划结果解析失败：${message}`, 'PLAN_PARSE_FAILED')
  }

  if (plan.steps.length > task.budget.maxSteps) {
    throw new PlannerError(`规划步骤数 ${plan.steps.length} 超过上限 ${task.budget.maxSteps}`, 'PLAN_PARSE_FAILED')
  }

  if (countExecutablePlanSteps(plan) === 0) {
    throw new PlannerError('规划未包含可执行的 tool 步骤', 'PLAN_PARSE_FAILED')
  }

  const withUsage = applyPlannerTokenUsage(task, completion.usage)
  const withGoal = updateAgentTaskRecord(withUsage.id, {
    goal: plan.goal,
    notes: plan.summary ?? withUsage.notes,
  })

  return { plan, task: withGoal }
}

function isPlannerModelFallbackError(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false
  if (error.retryable) return true
  return /Insufficient Balance|余额|402|401|403|quota|credit/i.test(error.message)
}

async function callPlannerModel(
  task: AgentTask,
  options: TaskPlannerOptions,
): Promise<{ plan: TaskPlan; task: AgentTask }> {
  const candidates = resolveTaskPlannerModelCandidates({
    assistantId: task.assistantId,
    explicitPlannerModelId: task.plannerModelId,
  })
  if (candidates.length === 0) {
    throw new PlannerError('未配置规划模型', 'MODEL_UNAVAILABLE')
  }

  let lastError: unknown
  for (let index = 0; index < candidates.length; index++) {
    const modelId = candidates[index]!
    try {
      const planned = await callPlannerModelWithId(task, modelId, options)
      if (index > 0) {
        planned.task = updateAgentTaskRecord(planned.task.id, { plannerModelId: modelId })
      }
      return planned
    } catch (error) {
      lastError = error
      const hasFallback = index < candidates.length - 1
      if (error instanceof PlannerError) {
        if (error.code === 'PLAN_PARSE_FAILED' && hasFallback) {
          continue
        }
        throw error
      }
      if (isPlannerModelFallbackError(error) && hasFallback) {
        continue
      }
      if (error instanceof ProviderError) {
        throw new PlannerError(error.message, 'MODEL_UNAVAILABLE')
      }
      throw error
    }
  }

  if (lastError instanceof PlannerError) {
    throw lastError
  }
  if (lastError instanceof ProviderError) {
    throw new PlannerError(lastError.message, 'MODEL_UNAVAILABLE')
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new PlannerError(message, 'MODEL_UNAVAILABLE')
}

export async function runTaskPlanner(input: unknown, options: TaskPlannerOptions = {}): Promise<AgentTask> {
  const data = TaskPlanInputSchema.parse(input)
  const task = getAgentTask(data.taskId)
  if (!task) {
    throw new PlannerError('任务不存在', 'NOT_FOUND')
  }

  assertTaskPlannable(task)

  const workerId = options.workerId ?? data.workerId ?? `planner-${task.id.slice(0, 8)}`
  const shouldExecute = options.execute ?? data.execute ?? false
  const locked = tryAcquireAgentTaskLock(task.id, workerId)
  if (!locked) {
    throw new PlannerError('已有任务正在执行', 'LOCK_HELD')
  }

  let plannedTask = task

  try {
    plannedTask = updateAgentTaskRecord(plannedTask.id, { status: 'planning' })
    logStructured('task-runtime', 'info', `task planning started: ${plannedTask.id}`)

    const planned = await callPlannerModel(plannedTask, options)
    const stepRecords = taskPlanToStepRecords(planned.plan, planned.task)
    plannedTask = replaceTaskPendingSteps(planned.task.id, stepRecords)
    plannedTask = updateAgentTaskRecord(plannedTask.id, { status: 'pending' })

    logStructured(
      'task-runtime',
      'info',
      `task planning completed: ${plannedTask.id} steps=${stepRecords.length} executable=${countExecutablePlanSteps(planned.plan)}`,
    )
  } catch (error) {
    if (error instanceof ProviderError) {
      const failed = updateAgentTaskRecord(plannedTask.id, { status: 'failed' })
      emitTaskFinished(failed, 'failed')
      throw new PlannerError(error.message, 'MODEL_UNAVAILABLE')
    }

    if (error instanceof PlannerError) {
      if (error.code !== 'LOCK_HELD' && error.code !== 'NOT_FOUND') {
        const failed = updateAgentTaskRecord(plannedTask.id, { status: 'failed' })
        emitTaskFinished(failed, 'failed')
      }
      throw error
    }

    const message = error instanceof Error ? error.message : String(error)
    const failed = updateAgentTaskRecord(plannedTask.id, { status: 'failed' })
    emitTaskFinished(failed, 'failed')
    throw new PlannerError(message, 'PLAN_PARSE_FAILED')
  } finally {
    releaseAgentTaskLock(plannedTask.id)
  }

  if (shouldExecute) {
    return runTaskExecutor({ taskId: plannedTask.id, workerId }, { workerId, signal: options.signal })
  }

  return plannedTask
}

export { taskPlanToStepRecords, countExecutablePlanSteps }
