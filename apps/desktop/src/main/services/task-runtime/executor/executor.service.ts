import { randomUUID } from 'node:crypto'

import {
  TaskExecuteInputSchema,
  isTaskBudgetExhausted,
  isTaskToolStepRecord,
  type AgentTask,
} from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import {
  appendTaskToolSteps,
  getAgentTask,
  releaseAgentTaskLock,
  tryAcquireAgentTaskLock,
  updateAgentTaskRecord,
} from '../store'
import { isTerminalTaskStatus } from '../state-machine'
import { scheduleStepRetry } from '../stage-gate/stage-gate.service'
import {
  applyStageGate,
  assertTaskExecutable,
  countCompletedSteps,
  delayExecutorRetry,
  executeToolStep,
  failTask,
  finalizeExecutorCompletion,
  getPendingSteps,
  markStepSkipped,
  resumeExecutingIfNeeded,
  shouldRunStageGate,
} from './executor-helpers'
import { ExecutorError, type TaskExecutorOptions } from './executor-types'

export { ExecutorError, type TaskExecutorOptions } from './executor-types'

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
        await delayExecutorRetry(options.signal)
      }
    }
  } finally {
    releaseAgentTaskLock(currentTask.id)
  }
}

