import type { AgentTask } from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import type { TaskOrchestratorOptions } from '../orchestrator/orchestrator.service'
import {
  TaskWorkerAbortedError,
  executeTaskWorkerRun,
  getTaskWorkerSnapshot,
} from './task-worker.service'

interface QueueItem {
  taskId: string
  options: TaskOrchestratorOptions
  resolve: (task: AgentTask) => void
  reject: (error: unknown) => void
}

const queue: QueueItem[] = []
const pendingRuns = new Map<string, Promise<AgentTask>>()

let draining = false

export { getTaskWorkerSnapshot }

export function scheduleTaskRun(
  taskId: string,
  options: TaskOrchestratorOptions = {},
): Promise<AgentTask> {
  const existing = pendingRuns.get(taskId)
  if (existing) {
    return existing
  }

  const promise = new Promise<AgentTask>((resolve, reject) => {
    queue.push({ taskId, options, resolve, reject })
  })

  pendingRuns.set(taskId, promise)
  promise.finally(() => {
    pendingRuns.delete(taskId)
  })

  void drainTaskQueue()
  return promise
}

export function enqueueTaskRun(taskId: string, options: TaskOrchestratorOptions = {}): void {
  void scheduleTaskRun(taskId, options).catch((error) => {
    if (error instanceof TaskWorkerAbortedError) {
      return
    }
    logStructured(
      'task-runtime',
      'error',
      `background task run failed: taskId=${taskId} error=${error instanceof Error ? error.message : String(error)}`,
    )
  })
}

export function cancelScheduledTaskRun(taskId: string): boolean {
  let cancelled = false

  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const item = queue[index]
    if (item?.taskId !== taskId) continue
    queue.splice(index, 1)
    item.reject(new TaskWorkerAbortedError())
    cancelled = true
  }

  return cancelled
}

async function drainTaskQueue(): Promise<void> {
  if (draining) return
  draining = true

  try {
    while (queue.length > 0) {
      const item = queue.shift()!
      logStructured('task-runtime', 'info', `task worker dequeued: taskId=${item.taskId}`)

      try {
        const task = await executeTaskWorkerRun(item.taskId, item.options)
        item.resolve(task)
      } catch (error) {
        item.reject(error)
      }
    }
  } finally {
    draining = false
    if (queue.length > 0) {
      void drainTaskQueue()
    }
  }
}
