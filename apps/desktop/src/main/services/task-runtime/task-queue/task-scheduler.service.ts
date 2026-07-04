import { parseSessionActiveTaskId, type AgentTask, type TaskStatus } from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import { hasPendingToolSteps } from '../orchestrator/orchestrator.service'
import {
  TASK_PAUSED_FROM_STATUS_KEY,
  resolveResumeTaskStatus,
} from '../state-machine'
import { getAgentTask, listAgentTasksByAssistant, updateAgentTaskRecord } from '../store'
import { emitTaskResumed } from '../task-event.service'
import { enqueueTaskRun } from './task-queue.service'
import { isTaskResumable, normalizeInterruptedTask, resumeTaskIfNeeded } from './task-resume.service'
import { enqueuePeriodicHeartbeatTask } from './periodic-heartbeat-task'

export type TaskSchedulerTickResult = 'idle' | 'scheduled'

function readPausedFromStatus(metadata: Record<string, unknown>): TaskStatus | undefined {
  const raw = metadata[TASK_PAUSED_FROM_STATUS_KEY]
  if (typeof raw !== 'string') return undefined
  const allowed: TaskStatus[] = ['pending', 'planning', 'executing', 'reflecting', 'retrying']
  return allowed.includes(raw as TaskStatus) ? (raw as TaskStatus) : undefined
}

function enqueueTaskRunForTask(task: AgentTask, workerPrefix: string): void {
  const normalized = normalizeInterruptedTask(task)
  const skipPlan = normalized.history.length > 0 && hasPendingToolSteps(normalized)
  enqueueTaskRun(normalized.id, {
    skipPlan,
    workerId: `${workerPrefix}-${normalized.id.slice(0, 8)}`,
  })
}

export function resumePausedTaskAndSchedule(taskId: string): boolean {
  const task = getAgentTask(taskId)
  if (!task || task.status !== 'paused') {
    return false
  }

  const pausedFrom = readPausedFromStatus(task.metadata)
  const nextStatus = resolveResumeTaskStatus(pausedFrom)
  const metadata = { ...task.metadata }
  delete metadata[TASK_PAUSED_FROM_STATUS_KEY]

  let updated = updateAgentTaskRecord(task.id, {
    status: nextStatus,
    metadata,
  })
  emitTaskResumed(updated, nextStatus)

  updated = normalizeInterruptedTask(updated)
  if (!isTaskResumable(updated)) {
    logStructured('task-runtime', 'info', `task scheduler skipped non-runnable task: ${taskId}`)
    return true
  }

  enqueueTaskRunForTask(updated, 'scheduler')
  logStructured('task-runtime', 'info', `task scheduler resumed paused task: ${taskId}`)
  return true
}

export function scheduleTaskIfNeeded(taskId: string): boolean {
  const task = getAgentTask(taskId)
  if (!task) {
    return false
  }
  if (task.status === 'paused') {
    return resumePausedTaskAndSchedule(taskId)
  }
  return resumeTaskIfNeeded(taskId)
}

export function runTaskSchedulerTick(options: {
  assistantId: string
  sessionMetadata?: Record<string, unknown>
}): TaskSchedulerTickResult {
  const activeTaskId = options.sessionMetadata
    ? parseSessionActiveTaskId(options.sessionMetadata)
    : undefined

  if (activeTaskId && scheduleTaskIfNeeded(activeTaskId)) {
    return 'scheduled'
  }

  const candidates = listAgentTasksByAssistant(options.assistantId, 20).filter(
    (task) => task.status === 'paused' || isTaskResumable(task),
  )

  for (const task of candidates) {
    if (activeTaskId && task.id === activeTaskId) {
      continue
    }
    if (scheduleTaskIfNeeded(task.id)) {
      return 'scheduled'
    }
  }

  return 'idle'
}

export function runTaskSchedulerTickWithPeriodic(options: {
  assistantId: string
  workspaceId: string
  sessionId: string
  sessionMetadata?: Record<string, unknown>
}): TaskSchedulerTickResult {
  const tick = runTaskSchedulerTick({
    assistantId: options.assistantId,
    sessionMetadata: options.sessionMetadata,
  })
  if (tick === 'scheduled') {
    return tick
  }

  if (
    enqueuePeriodicHeartbeatTask({
      workspaceId: options.workspaceId,
      assistantId: options.assistantId,
      sessionId: options.sessionId,
    })
  ) {
    return 'scheduled'
  }

  return 'idle'
}
