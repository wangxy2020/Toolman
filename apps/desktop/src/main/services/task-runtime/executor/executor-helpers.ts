import {
  TASK_RETRY_DELAY_MS,
  isTaskToolStepRecord,
  parseTaskToolStepInput,
  type AgentTask,
  type TaskStepRecord,
} from '@toolman/shared'

import type { ToolExecutionContext } from '../../tool-executor/types'
import { logStructured } from '../../structured-log.service'
import { getAssistantRow } from '../../assistant.service'
import { parseAssistantRuntime } from '../../agent-runtime'
import { updateAgentTaskRecord } from '../store'
import { isTerminalTaskStatus } from '../state-machine'
import { runStageGateAfterStep } from '../stage-gate/stage-gate.service'
import { emitTaskFinished, emitTaskStepStarted } from '../task-event.service'
import { resolveTaskToolWorkingDirectory } from '../task-workspace.service'
import { runTaskTool } from './tool-runner'
import {
  findPreviousCompletedToolStep,
  injectStepContextIntoToolArgs,
  summarizeStepOutputText,
} from './step-context'
import { ExecutorError, type TaskExecutorOptions } from './executor-types'

export function buildToolContext(task: AgentTask, override?: Partial<ToolExecutionContext>): ToolExecutionContext {
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

export function updateStepInHistory(
  history: TaskStepRecord[],
  stepId: string,
  patch: Partial<TaskStepRecord>,
): TaskStepRecord[] {
  return history.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
}

export function countCompletedSteps(history: TaskStepRecord[]): number {
  return history.filter((step) => step.status === 'completed').length
}

export function markStepRunning(task: AgentTask, step: TaskStepRecord): AgentTask {
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

export function markStepCompleted(task: AgentTask, step: TaskStepRecord, output: string): AgentTask {
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

export function markStepSkipped(task: AgentTask, step: TaskStepRecord, reason: string): AgentTask {
  const now = Date.now()
  const history = updateStepInHistory(task.history, step.id, {
    status: 'skipped',
    finishedAt: now,
    error: reason,
  })

  return updateAgentTaskRecord(task.id, { history })
}

export async function executeToolStep(
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

export function failTask(task: AgentTask, reason: string): AgentTask {
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

export function countCompletedToolSteps(history: TaskStepRecord[]): number {
  return history.filter((step) => step.kind === 'tool' && step.status === 'completed').length
}

export function hasRemainingPendingToolSteps(task: AgentTask): boolean {
  return task.history.some((step) => step.status === 'pending' && step.kind === 'tool')
}

export function finalizeExecutorCompletion(task: AgentTask): AgentTask {
  if (countCompletedToolSteps(task.history) === 0) {
    return failTask(task, '没有成功执行任何工具步骤')
  }
  return completeTask(task)
}

export function completeTask(task: AgentTask): AgentTask {
  const completed = updateAgentTaskRecord(task.id, {
    status: 'completed',
    currentStepId: null,
  })
  emitTaskFinished(completed, 'completed')
  logStructured('task-runtime', 'info', `task completed: ${task.id}`)
  return completed
}

export function getPendingSteps(task: AgentTask): TaskStepRecord[] {
  return task.history.filter((step) => step.status === 'pending')
}

export function assertTaskExecutable(task: AgentTask): void {
  if (isTerminalTaskStatus(task.status)) {
    throw new ExecutorError('任务已结束', 'INVALID_STATE')
  }
  if (task.status === 'paused') {
    throw new ExecutorError('任务已暂停', 'INVALID_STATE')
  }
}

export function resumeExecutingIfNeeded(task: AgentTask): AgentTask {
  if (task.status === 'pending' || task.status === 'retrying') {
    return updateAgentTaskRecord(task.id, { status: 'executing' })
  }
  return task
}

export async function delayExecutorRetry(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new ExecutorError('任务执行已取消', 'INVALID_STATE')
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, TASK_RETRY_DELAY_MS)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new ExecutorError('任务执行已取消', 'INVALID_STATE'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function shouldRunStageGate(task: AgentTask, options: TaskExecutorOptions): boolean {
  if (options.reflectAfterStep === false) return false
  if (options.reflectAfterStep === 'each') return true
  return !hasRemainingPendingToolSteps(task)
}

export async function applyStageGate(
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

