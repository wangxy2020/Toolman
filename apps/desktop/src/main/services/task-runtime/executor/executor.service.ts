import { randomUUID } from 'node:crypto'

import {
  TaskExecuteInputSchema,
  isTaskBudgetExhausted,
  isTaskToolStepRecord,
  parseTaskToolStepInput,
  type AgentTask,
  type TaskStepRecord,
} from '@toolman/shared'

import type { ToolExecutionContext } from '../../tool-executor/types'
import { logStructured } from '../../structured-log.service'
import { getAssistantRow } from '../../assistant.service'
import { parseAssistantRuntime } from '../../agent-runtime'
import {
  appendTaskToolSteps,
  getAgentTask,
  releaseAgentTaskLock,
  tryAcquireAgentTaskLock,
  updateAgentTaskRecord,
} from '../store'
import { isTerminalTaskStatus } from '../state-machine'
import { runStageGateAfterStep, scheduleStepRetry } from '../stage-gate/stage-gate.service'
import { emitTaskFinished, emitTaskStepStarted } from '../task-event.service'
import { resolveTaskToolWorkingDirectory } from '../task-workspace.service'
import { runTaskTool } from './tool-runner'
import {
  findPreviousCompletedToolStep,
  injectStepContextIntoToolArgs,
  summarizeStepOutputText,
} from './step-context'

export class ExecutorError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'LOCK_HELD' | 'INVALID_STATE' | 'STEP_FAILED',
  ) {
    super(message)
    this.name = 'ExecutorError'
  }
}

export interface TaskExecutorOptions {
  workerId?: string
  signal?: AbortSignal
  toolContext?: Partial<ToolExecutionContext>
  /**
   * Stage-gate reflection after tool steps.
   * - default / true: reflect only after the last pending tool step
   * - 'each': reflect after every tool step (legacy)
   * - false: skip reflection
   */
  reflectAfterStep?: boolean | 'each'
}

function buildToolContext(task: AgentTask, override?: Partial<ToolExecutionContext>): ToolExecutionContext {
  const assistant = task.assistantId ? getAssistantRow(task.assistantId) : null
  const runtime = parseAssistantRuntime(assistant, task.workspaceId)
  return {
    workingDirectory: resolveTaskToolWorkingDirectory(task),
    workspaceId: task.workspaceId,
    assistantId: task.assistantId,
    mcpServerIds: runtime.mcpServerIds,
    environmentVariables: runtime.toolContext.environmentVariables,
    ...override,
  }
}

function updateStepInHistory(
  history: TaskStepRecord[],
  stepId: string,
  patch: Partial<TaskStepRecord>,
): TaskStepRecord[] {
  return history.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
}

function countCompletedSteps(history: TaskStepRecord[]): number {
  return history.filter((step) => step.status === 'completed').length
}

function markStepRunning(task: AgentTask, step: TaskStepRecord): AgentTask {
  const now = Date.now()
  const history = updateStepInHistory(task.history, step.id, {
    status: 'running',
    startedAt: step.startedAt ?? now,
    error: undefined,
  })

  const updated = updateAgentTaskRecord(task.id, {
    status: 'executing',
    currentStepId: step.id,
    history,
  })

  emitTaskStepStarted(updated, {
    stepId: step.id,
    stepKind: step.kind,
    stepTitle: step.title,
  })

  return updated
}

function markStepCompleted(task: AgentTask, step: TaskStepRecord, output: string): AgentTask {
  const now = Date.now()
  const history = updateStepInHistory(task.history, step.id, {
    status: 'completed',
    output: { text: output },
    finishedAt: now,
    error: undefined,
  })

  return updateAgentTaskRecord(task.id, {
    history,
  })
}

function markStepSkipped(task: AgentTask, step: TaskStepRecord, reason: string): AgentTask {
  const now = Date.now()
  const history = updateStepInHistory(task.history, step.id, {
    status: 'skipped',
    finishedAt: now,
    error: reason,
  })

  return updateAgentTaskRecord(task.id, { history })
}

async function executeToolStep(
  task: AgentTask,
  step: TaskStepRecord,
  options: TaskExecutorOptions,
): Promise<{ task: AgentTask; output: string }> {
  if (!isTaskToolStepRecord(step)) {
    throw new ExecutorError(`步骤 ${step.id} 不是可执行的工具步骤`, 'STEP_FAILED')
  }

  const payload = parseTaskToolStepInput(step.input)
  const runningTask = markStepRunning(task, step)

  if (options.signal?.aborted) {
    throw new ExecutorError('任务执行已取消', 'INVALID_STATE')
  }

  const previousStep = findPreviousCompletedToolStep(runningTask, step.id)
  const previousOutput = previousStep ? summarizeStepOutputText(previousStep) : undefined
  const resolvedArgsJson = injectStepContextIntoToolArgs(
    payload.toolName,
    payload.argsJson,
    previousOutput,
  )

  const result = await runTaskTool(payload.toolName, resolvedArgsJson, buildToolContext(runningTask, options.toolContext), {
    task: runningTask,
    stepId: step.id,
    toolCallId: payload.toolCallId ?? step.id,
    signal: options.signal,
  })

  const completedTask = markStepCompleted(runningTask, step, result.output)
  return { task: completedTask, output: result.output }
}

function failTask(task: AgentTask, reason: string): AgentTask {
  const failed = updateAgentTaskRecord(task.id, {
    status: 'failed',
    metadata: {
      ...task.metadata,
      executorFailureReason: reason,
    },
  })
  emitTaskFinished(failed, 'failed')
  logStructured('task-runtime', 'error', `task failed: ${task.id} reason=${reason}`)
  return failed
}

function countCompletedToolSteps(history: TaskStepRecord[]): number {
  return history.filter((step) => step.kind === 'tool' && step.status === 'completed').length
}

function hasRemainingPendingToolSteps(task: AgentTask): boolean {
  return task.history.some((step) => step.status === 'pending' && step.kind === 'tool')
}

function finalizeExecutorCompletion(task: AgentTask): AgentTask {
  if (countCompletedToolSteps(task.history) === 0) {
    return failTask(task, '没有成功执行任何工具步骤')
  }
  return completeTask(task)
}

function completeTask(task: AgentTask): AgentTask {
  const completed = updateAgentTaskRecord(task.id, {
    status: 'completed',
    currentStepId: null,
  })
  emitTaskFinished(completed, 'completed')
  logStructured('task-runtime', 'info', `task completed: ${task.id}`)
  return completed
}

function getPendingSteps(task: AgentTask): TaskStepRecord[] {
  return task.history.filter((step) => step.status === 'pending')
}

function assertTaskExecutable(task: AgentTask): void {
  if (isTerminalTaskStatus(task.status)) {
    throw new ExecutorError('任务已结束', 'INVALID_STATE')
  }
  if (task.status === 'paused') {
    throw new ExecutorError('任务已暂停', 'INVALID_STATE')
  }
}

function resumeExecutingIfNeeded(task: AgentTask): AgentTask {
  if (task.status === 'pending' || task.status === 'retrying') {
    return updateAgentTaskRecord(task.id, { status: 'executing' })
  }
  return task
}

function shouldRunStageGate(task: AgentTask, options: TaskExecutorOptions): boolean {
  if (options.reflectAfterStep === false) return false
  if (options.reflectAfterStep === 'each') return true
  return !hasRemainingPendingToolSteps(task)
}

async function applyStageGate(
  task: AgentTask,
  stepId: string,
  options: TaskExecutorOptions,
): Promise<AgentTask> {
  const gate = await runStageGateAfterStep(task, { stepId, signal: options.signal })
  if (gate.terminal) {
    return gate.task
  }
  return resumeExecutingIfNeeded(gate.task)
}

export async function runTaskExecutor(input: unknown, options: TaskExecutorOptions = {}): Promise<AgentTask> {
  const data = TaskExecuteInputSchema.parse(input)
  let task = getAgentTask(data.taskId)
  if (!task) {
    throw new ExecutorError('任务不存在', 'NOT_FOUND')
  }

  if (data.steps?.length) {
    task = appendTaskToolSteps(task.id, data.steps)
  }

  assertTaskExecutable(task)

  const workerId = options.workerId ?? data.workerId ?? randomUUID()
  const locked = tryAcquireAgentTaskLock(task.id, workerId)
  if (!locked) {
    throw new ExecutorError('已有任务正在执行', 'LOCK_HELD')
  }

  let currentTask = task

  try {
    currentTask = updateAgentTaskRecord(currentTask.id, { status: 'executing' })

    while (true) {
      currentTask = getAgentTask(currentTask.id) ?? currentTask

      if (currentTask.status === 'paused' || currentTask.status === 'cancelled') {
        return currentTask
      }

      if (isTerminalTaskStatus(currentTask.status)) {
        return currentTask
      }

      if (isTaskBudgetExhausted(currentTask.budget)) {
        return failTask(currentTask, 'Token 预算已耗尽')
      }

      if (countCompletedSteps(currentTask.history) >= currentTask.budget.maxSteps) {
        return failTask(currentTask, '超过最大步骤数')
      }

      const pendingSteps = getPendingSteps(currentTask)
      if (pendingSteps.length === 0) {
        if (currentTask.status === 'executing') {
          return finalizeExecutorCompletion(currentTask)
        }
        return currentTask
      }

      const step = pendingSteps[0]!

      if (!isTaskToolStepRecord(step)) {
        currentTask = markStepSkipped(currentTask, step, '该步骤类型暂不支持自动执行')
        continue
      }

      try {
        const result = await executeToolStep(currentTask, step, options)
        currentTask = result.task

        if (shouldRunStageGate(currentTask, options)) {
          currentTask = await applyStageGate(currentTask, step.id, options)
          if (isTerminalTaskStatus(currentTask.status)) {
            return currentTask
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const retry = scheduleStepRetry(currentTask, step, message)
        currentTask = retry.task

        if (retry.terminal) {
          logStructured(
            'task-runtime',
            'error',
            `task step failed: ${currentTask.id} step=${step.id} error=${message}`,
          )
          throw error instanceof ExecutorError ? error : new ExecutorError(message, 'STEP_FAILED')
        }

        currentTask = resumeExecutingIfNeeded(currentTask)
      }
    }
  } finally {
    releaseAgentTaskLock(currentTask.id)
  }
}
