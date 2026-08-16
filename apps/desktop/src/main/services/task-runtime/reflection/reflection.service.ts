import { ProviderError } from '@toolman/model-gateway'

import {
  TaskReflectInputSchema,
  normalizeReflectionVerdict,
  type AgentTask,
} from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import {
  getAgentTask,
  releaseAgentTaskLock,
  tryAcquireAgentTaskLock,
  updateAgentTaskRecord,
} from '../store'
import { isTerminalTaskStatus } from '../state-machine'
import { emitTaskFinished, emitTaskReflection } from '../task-event.service'
import { applyReflectionVerdict } from './reflection-verdict'
import { callReflectionModel } from './reflection-model'
import {
  ReflectionError,
  type TaskReflectionOptions,
  type TaskReflectionOutput,
} from './reflection-types'

export {
  ReflectionError,
  type TaskReflectionOptions,
  type TaskReflectionOutput,
} from './reflection-types'

function assertTaskReflectable(task: AgentTask): void {
  if (isTerminalTaskStatus(task.status)) {
    throw new ReflectionError('任务已结束，无法反思', 'INVALID_STATE')
  }
  if (task.status === 'paused') {
    throw new ReflectionError('任务已暂停，请先恢复', 'INVALID_STATE')
  }
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

export async function runTaskReflection(
  input: unknown,
  options: TaskReflectionOptions = {},
): Promise<TaskReflectionOutput> {
  const data = TaskReflectInputSchema.parse(input)
  const task = getAgentTask(data.taskId)
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
