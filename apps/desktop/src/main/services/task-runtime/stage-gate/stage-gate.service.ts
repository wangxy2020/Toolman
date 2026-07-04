import {
  isTaskBudgetExhausted,
  isTaskRetryLimitReached,
  type AgentTask,
  type TaskReflectionVerdict,
  type TaskStepRecord,
} from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import { performTaskReflection } from '../reflection/reflection.service'
import { isTerminalTaskStatus } from '../state-machine'
import { emitTaskFinished, emitTaskRetry } from '../task-event.service'
import { updateAgentTaskRecord } from '../store'

export interface StageGateResult {
  task: AgentTask
  verdict?: TaskReflectionVerdict
  terminal: boolean
}

export interface StageGateOptions {
  stepId: string
  signal?: AbortSignal
}

function updateStepInHistory(
  history: TaskStepRecord[],
  stepId: string,
  patch: Partial<TaskStepRecord>,
): TaskStepRecord[] {
  return history.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
}

function failTaskWithReason(task: AgentTask, reason: string): AgentTask {
  const failed = updateAgentTaskRecord(task.id, {
    status: 'failed',
    metadata: {
      ...task.metadata,
      stageGateFailureReason: reason,
    },
  })
  emitTaskFinished(failed, 'failed')
  logStructured('task-runtime', 'error', `task stage gate failed: ${task.id} reason=${reason}`)
  return failed
}

export function scheduleStepRetry(
  task: AgentTask,
  step: TaskStepRecord,
  error: string,
): { task: AgentTask; terminal: boolean } {
  const nextRetryCount = task.retryCount + 1

  if (isTaskRetryLimitReached(nextRetryCount)) {
    const now = Date.now()
    const history = updateStepInHistory(task.history, step.id, {
      status: 'failed',
      error,
      finishedAt: now,
      retryCount: (step.retryCount ?? 0) + 1,
    })
    const failed = updateAgentTaskRecord(task.id, {
      status: 'failed',
      currentStepId: step.id,
      history,
      retryCount: nextRetryCount,
      metadata: {
        ...task.metadata,
        executorFailureReason: error,
      },
    })
    emitTaskFinished(failed, 'failed')
    logStructured(
      'task-runtime',
      'error',
      `task step retry limit reached: ${task.id} step=${step.id} retryCount=${nextRetryCount}`,
    )
    return { task: failed, terminal: true }
  }

  const history = updateStepInHistory(task.history, step.id, {
    status: 'pending',
    error,
    retryCount: (step.retryCount ?? 0) + 1,
    startedAt: undefined,
    finishedAt: undefined,
    output: undefined,
  })

  const retried = updateAgentTaskRecord(task.id, {
    status: 'retrying',
    retryCount: nextRetryCount,
    currentStepId: null,
    history,
  })

  emitTaskRetry(retried, {
    stepId: step.id,
    retryCount: nextRetryCount,
    reason: error,
  })

  logStructured(
    'task-runtime',
    'info',
    `task step scheduled for retry: ${task.id} step=${step.id} retryCount=${nextRetryCount}`,
  )

  return { task: retried, terminal: false }
}

export async function runStageGateAfterStep(
  task: AgentTask,
  options: StageGateOptions,
): Promise<StageGateResult> {
  if (isTaskBudgetExhausted(task.budget)) {
    return { task: failTaskWithReason(task, 'Token 预算已耗尽'), terminal: true }
  }

  try {
    const result = await performTaskReflection(task, {
      stepId: options.stepId,
      signal: options.signal,
    })

    return {
      task: result.task,
      verdict: result.verdict,
      terminal: isTerminalTaskStatus(result.task.status),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logStructured(
      'task-runtime',
      'warn',
      `task stage gate soft-continue: ${task.id} reason=${message}`,
    )
    const resumed = updateAgentTaskRecord(task.id, {
      status: 'executing',
      metadata: {
        ...task.metadata,
        lastReflection: {
          verdict: 'continue',
          reason: `反思跳过（${message}），继续执行剩余步骤。`,
          summary: '反思未返回有效 JSON，已自动继续。',
          at: Date.now(),
        },
      },
    })
    return { task: resumed, terminal: false }
  }
}
