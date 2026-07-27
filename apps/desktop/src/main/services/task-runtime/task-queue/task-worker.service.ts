import { randomUUID } from 'node:crypto'

import type { AgentTask } from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import { runTaskOrchestrator, type TaskOrchestratorOptions } from '../orchestrator/orchestrator.service'

const PROCESS_WORKER_ID = `worker-${randomUUID().slice(0, 8)}`

interface ActiveTaskRun {
  taskId: string
  controller: AbortController
  startedAt: number
}

const activeRuns = new Map<string, ActiveTaskRun>()

export class TaskWorkerAbortedError extends Error {
  constructor(message = '任务执行已中断') {
    super(message)
    this.name = 'TaskWorkerAbortedError'
  }
}

export function getTaskWorkerSnapshot(): {
  workerId: string
  activeTaskId: string | null
  activeTaskIds: string[]
} {
  const activeTaskIds = [...activeRuns.keys()]
  return {
    workerId: PROCESS_WORKER_ID,
    activeTaskId: activeTaskIds[0] ?? null,
    activeTaskIds,
  }
}

export function isTaskWorkerRunning(taskId: string): boolean {
  return activeRuns.has(taskId)
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): void {
  if (!source) return
  if (source.aborted) {
    target.abort()
    return
  }
  source.addEventListener('abort', () => target.abort(), { once: true })
}

export async function executeTaskWorkerRun(
  taskId: string,
  options: TaskOrchestratorOptions = {},
): Promise<AgentTask> {
  const controller = new AbortController()
  linkAbortSignal(options.signal, controller)

  const workerId = options.workerId ?? PROCESS_WORKER_ID
  activeRuns.set(taskId, { taskId, controller, startedAt: Date.now() })

  logStructured('task-runtime', 'info', `task worker run started: taskId=${taskId}`)

  try {
    const task = await runTaskOrchestrator(
      { taskId, workerId, skipPlan: options.skipPlan },
      { ...options, workerId, signal: controller.signal },
    )
    return task
  } catch (error) {
    if (controller.signal.aborted) {
      throw new TaskWorkerAbortedError()
    }
    throw error
  } finally {
    activeRuns.delete(taskId)
    logStructured('task-runtime', 'info', `task worker run finished: taskId=${taskId}`)
  }
}

export function abortTaskWorkerRun(taskId: string): boolean {
  const active = activeRuns.get(taskId)
  if (!active) {
    return false
  }
  active.controller.abort()
  logStructured('task-runtime', 'info', `task worker run aborted: taskId=${taskId}`)
  return true
}
