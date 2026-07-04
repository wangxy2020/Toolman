import { randomUUID } from 'node:crypto'

import { isActiveTaskStatus, type AgentTask } from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import {
  hasPendingToolSteps,
  runTaskOrchestrator,
  type TaskOrchestratorOptions,
} from '../orchestrator/orchestrator.service'
import { isTerminalTaskStatus } from '../state-machine'
import {
  getAgentTask,
  getGlobalAgentTaskLock,
  listAgentTasksByWorkspace,
  releaseAgentTaskLock,
  updateAgentTaskRecord,
} from '../store'
import { enqueueTaskRun, scheduleTaskRun } from './task-queue.service'

export function isTaskResumable(task: AgentTask): boolean {
  if (isTerminalTaskStatus(task.status) || task.status === 'paused') {
    return false
  }
  if (isActiveTaskStatus(task.status)) {
    return true
  }
  if (task.status === 'pending') {
    return task.history.length === 0 || hasPendingToolSteps(task)
  }
  return false
}

export function releaseStaleTaskLockOnStartup(): void {
  const lock = getGlobalAgentTaskLock()
  if (!lock) return

  const holder = getAgentTask(lock.taskId)
  if (!holder || !isActiveTaskStatus(holder.status)) {
    releaseAgentTaskLock(lock.taskId)
    logStructured('task-runtime', 'info', `released stale task lock: taskId=${lock.taskId}`)
  }
}

export function normalizeInterruptedTask(task: AgentTask): AgentTask {
  if (task.status === 'planning' || task.status === 'reflecting') {
    return updateAgentTaskRecord(task.id, { status: 'pending', currentStepId: null })
  }

  if (task.status === 'executing' || task.status === 'retrying') {
    const history = task.history.map((step) =>
      step.status === 'running'
        ? {
            ...step,
            status: 'pending' as const,
            startedAt: undefined,
            finishedAt: undefined,
          }
        : step,
    )
    const nextStatus = hasPendingToolSteps({ ...task, history }) ? 'pending' : task.status
    return updateAgentTaskRecord(task.id, {
      status: nextStatus,
      history,
      currentStepId: null,
    })
  }

  return task
}

export function listResumableTasks(workspaceId: string, limit = 100): AgentTask[] {
  return listAgentTasksByWorkspace(workspaceId, limit).filter(isTaskResumable)
}

export function resumeTaskIfNeeded(taskId: string): boolean {
  const task = getAgentTask(taskId)
  if (!task || !isTaskResumable(task)) {
    return false
  }

  const normalized = normalizeInterruptedTask(task)
  const skipPlan = normalized.history.length > 0 && hasPendingToolSteps(normalized)
  enqueueTaskRun(normalized.id, { skipPlan, workerId: `resume-${taskId.slice(0, 8)}` })
  return true
}

export function bootstrapTaskWorkerResume(workspaceId: string): void {
  releaseStaleTaskLockOnStartup()

  const tasks = listResumableTasks(workspaceId)
  if (tasks.length === 0) {
    return
  }

  logStructured('task-runtime', 'info', `task worker resume: count=${tasks.length}`)

  for (const task of tasks) {
    resumeTaskIfNeeded(task.id)
  }
}

export async function awaitTaskRun(
  taskId: string,
  options: TaskOrchestratorOptions = {},
): Promise<AgentTask> {
  const task = getAgentTask(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  if (isTaskResumable(task)) {
    const normalized = normalizeInterruptedTask(task)
    const skipPlan =
      options.skipPlan ?? (normalized.history.length > 0 && hasPendingToolSteps(normalized))
    return scheduleTaskRun(taskId, {
      ...options,
      skipPlan,
      workerId: options.workerId ?? `await-${randomUUID().slice(0, 8)}`,
    })
  }

  return runTaskOrchestrator({ taskId, workerId: options.workerId, skipPlan: options.skipPlan }, options)
}
