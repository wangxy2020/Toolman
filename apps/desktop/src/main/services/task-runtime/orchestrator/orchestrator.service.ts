import { TaskRunInputSchema, isTaskBudgetExhausted, type AgentTask } from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import { ExecutorError, runTaskExecutor } from '../executor/executor.service'
import { runTaskPlanner } from '../planner/planner.service'
import { getAgentTask, repairTaskWorkspaceRecord, updateAgentTaskRecord } from '../store'
import { isTerminalTaskStatus } from '../state-machine'
import { emitTaskFinished } from '../task-event.service'
import { prepareTaskToolRuntime } from '../task-runtime-tool-context'

/** Safety cap for plan → execute loops (e.g. resume + replan edge cases). */
export const TASK_MAX_ORCHESTRATOR_LOOPS = 8

export class OrchestratorError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'INVALID_STATE' | 'BUDGET_EXHAUSTED' | 'LOOP_LIMIT',
  ) {
    super(message)
    this.name = 'OrchestratorError'
  }
}

export interface TaskOrchestratorOptions {
  workerId?: string
  signal?: AbortSignal
  skipPlan?: boolean
}

export function hasPendingToolSteps(task: AgentTask): boolean {
  return task.history.some((step) => step.status === 'pending' && step.kind === 'tool')
}

export function needsTaskPlanning(task: AgentTask, skipPlan = false): boolean {
  if (skipPlan) return false
  if (task.status !== 'pending') return false
  if (hasPendingToolSteps(task)) return false
  return task.history.length === 0
}

export function shouldRunTaskExecution(task: AgentTask): boolean {
  if (isTerminalTaskStatus(task.status) || task.status === 'paused') {
    return false
  }
  if (hasPendingToolSteps(task)) return true
  return task.status === 'retrying' || task.status === 'executing'
}

function assertTaskOrchestrable(task: AgentTask): void {
  if (isTerminalTaskStatus(task.status)) {
    throw new OrchestratorError('任务已结束', 'INVALID_STATE')
  }
  if (task.status === 'paused') {
    throw new OrchestratorError('任务已暂停，请先恢复', 'INVALID_STATE')
  }
}

function failTaskBudget(task: AgentTask): AgentTask {
  const failed = updateAgentTaskRecord(task.id, {
    status: 'failed',
    metadata: {
      ...task.metadata,
      orchestratorFailureReason: 'Token 预算已耗尽',
    },
  })
  emitTaskFinished(failed, 'failed')
  logStructured('task-runtime', 'error', `task orchestrator budget exhausted: ${task.id}`)
  return failed
}

export async function runTaskOrchestrator(
  input: unknown,
  options: TaskOrchestratorOptions = {},
): Promise<AgentTask> {
  const data = TaskRunInputSchema.parse(input)
  let task = getAgentTask(data.taskId)
  if (!task) {
    throw new OrchestratorError('任务不存在', 'NOT_FOUND')
  }

  task = repairTaskWorkspaceRecord(task)

  assertTaskOrchestrable(task)

  await prepareTaskToolRuntime(task)

  const workerId = options.workerId ?? data.workerId ?? `orchestrator-${task.id.slice(0, 8)}`
  const skipPlan = options.skipPlan ?? data.skipPlan ?? false

  logStructured('task-runtime', 'info', `task orchestrator started: ${task.id}`)

  let loops = 0

  while (loops < TASK_MAX_ORCHESTRATOR_LOOPS) {
    loops += 1
    task = getAgentTask(task.id) ?? task

    if (task.status === 'paused' || task.status === 'cancelled') {
      return task
    }
    if (isTerminalTaskStatus(task.status)) {
      return task
    }

    if (isTaskBudgetExhausted(task.budget)) {
      return failTaskBudget(task)
    }

    if (needsTaskPlanning(task, skipPlan)) {
      task = await runTaskPlanner(
        { taskId: task.id, workerId, execute: false },
        { workerId, signal: options.signal },
      )
      continue
    }

    if (shouldRunTaskExecution(task)) {
      try {
        task = await runTaskExecutor(
          { taskId: task.id, workerId },
          { workerId, signal: options.signal, reflectAfterStep: true },
        )
      } catch (error) {
        task = getAgentTask(task.id) ?? task
        if (isTerminalTaskStatus(task.status)) {
          return task
        }
        if (error instanceof ExecutorError) {
          throw new OrchestratorError(error.message, 'INVALID_STATE')
        }
        throw error
      }
      continue
    }

    break
  }

  task = getAgentTask(task.id) ?? task

  if (loops >= TASK_MAX_ORCHESTRATOR_LOOPS && !isTerminalTaskStatus(task.status)) {
    throw new OrchestratorError('任务编排循环超过上限', 'LOOP_LIMIT')
  }

  logStructured('task-runtime', 'info', `task orchestrator finished: ${task.id} status=${task.status}`)
  return task
}
