import { isActiveTaskStatus, type AgentTask } from '@toolman/shared'

import { logStructured } from '../../structured-log.service'
import { bindTaskToSession } from '../session-bind'
import {
  createAgentTaskRecord,
  getAgentTask,
  getGlobalAgentTaskLock,
  listAgentTasksByAssistant,
  updateAgentTaskRecord,
} from '../store'
import { emitTaskStarted } from '../task-event.service'
import { enqueueTaskRun } from './task-queue.service'
import { isTaskResumable } from './task-resume.service'

export const HEARTBEAT_PERIODIC_GOAL =
  '[系统心跳] 请检查工作目录与任务状态，如有未完成事项请继续推进，并简要汇报。'

export const TASK_HEARTBEAT_PERIODIC_KEY = 'heartbeatPeriodic'

function assistantHasRunnableWork(assistantId: string): boolean {
  return listAgentTasksByAssistant(assistantId, 20).some(
    (task) =>
      isActiveTaskStatus(task.status) ||
      task.status === 'paused' ||
      isTaskResumable(task),
  )
}

function isLockHeldByAssistant(assistantId: string): boolean {
  const lock = getGlobalAgentTaskLock()
  if (!lock) return false
  const holder = getAgentTask(lock.taskId)
  return holder?.assistantId === assistantId
}

export function enqueuePeriodicHeartbeatTask(options: {
  workspaceId: string
  assistantId: string
  sessionId: string
}): boolean {
  if (assistantHasRunnableWork(options.assistantId) || isLockHeldByAssistant(options.assistantId)) {
    return false
  }

  const title = '系统心跳任务'
  let task = createAgentTaskRecord({
    workspaceId: options.workspaceId,
    assistantId: options.assistantId,
    sessionId: options.sessionId,
    title,
    goal: HEARTBEAT_PERIODIC_GOAL,
  })
  task = updateAgentTaskRecord(task.id, {
    metadata: {
      ...task.metadata,
      [TASK_HEARTBEAT_PERIODIC_KEY]: true,
      source: 'heartbeat-scheduler',
    },
  })

  bindTaskToSession(options.sessionId, task.id)
  emitTaskStarted(task)

  const skipPlan = false
  enqueueTaskRun(task.id, {
    skipPlan,
    workerId: `heartbeat-${task.id.slice(0, 8)}`,
  })

  logStructured(
    'task-runtime',
    'info',
    `periodic heartbeat task enqueued: ${task.id} assistant=${options.assistantId}`,
  )
  return true
}

export function isPeriodicHeartbeatTask(task: AgentTask): boolean {
  return task.metadata[TASK_HEARTBEAT_PERIODIC_KEY] === true
}
