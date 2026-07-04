import type { AgentTask, TaskStatus } from '@toolman/shared'
import {
  createDefaultTaskTokenBudget,
  TaskControlInputSchema,
  TaskCreateInputSchema,
  TaskGetInputSchema,
  TaskListInputSchema,
  TaskReleaseSessionBindingInputSchema,
  parseSessionActiveTaskId,
  type TaskControlOutput,
  type TaskCreateInput,
  type TaskListOutput,
  isActiveTaskStatus,
} from '@toolman/shared'

import { getSessionRepository } from '../../db/repos'
import { getAssistantRow } from '../assistant.service'
import { logStructured } from '../structured-log.service'
import {
  inferTaskBudgetPresetForModels,
  resolveTaskExecutorModelId,
  resolveTaskPlannerModelId,
} from './resolve-models'
import {
  TASK_PAUSED_FROM_STATUS_KEY,
  TaskStateError,
  assertTaskCancelTransition,
  assertTaskPauseTransition,
  assertTaskResumeTransition,
  resolveResumeTaskStatus,
} from './state-machine'
import {
  cancelAgentTask,
  createAgentTaskRecord,
  getAgentTask,
  listAgentTasksByAssistant,
  listAgentTasksBySession,
  listAgentTasksByWorkspace,
  releaseAgentTaskLock,
  updateAgentTaskRecord,
} from './store'
import { buildTaskWorkingDirectoryMetadata } from './task-workspace.service'
import {
  cancelScheduledTaskRun,
  enqueueTaskRun,
} from './task-queue/task-queue.service'
import { abortTaskWorkerRun } from './task-queue/task-worker.service'
import { hasPendingToolSteps } from './orchestrator/orchestrator.service'
import { isTaskResumable, normalizeInterruptedTask } from './task-queue/task-resume.service'
import { bindTaskToSession, clearStaleTerminalSessionBinding, unbindTaskFromSession } from './session-bind'
import {
  emitTaskFinished,
  emitTaskPaused,
  emitTaskResumed,
  emitTaskStarted,
} from './task-event.service'

function taskNotFound(): TaskStateError {
  return new TaskStateError('任务不存在', 'NOT_FOUND')
}

function validateAssistantInWorkspace(assistantId: string | undefined, workspaceId: string): void {
  if (!assistantId) return
  const assistant = getAssistantRow(assistantId)
  if (!assistant || assistant.workspaceId !== workspaceId) {
    throw new Error('智能体不存在或不属于当前工作区')
  }
}

function validateSessionInWorkspace(sessionId: string | undefined, workspaceId: string): void {
  if (!sessionId) return
  const session = getSessionRepository().findRowById(sessionId)
  if (!session || session.workspaceId !== workspaceId) {
    throw new Error('话题不存在或不属于当前工作区')
  }
}

export function createTask(input: unknown): AgentTask {
  const data = TaskCreateInputSchema.parse(input) as TaskCreateInput
  validateAssistantInWorkspace(data.assistantId, data.workspaceId)
  validateSessionInWorkspace(data.sessionId, data.workspaceId)

  const plannerModelId = resolveTaskPlannerModelId({
    explicitPlannerModelId: data.plannerModelId,
    assistantId: data.assistantId,
  })
  const executorModelId = resolveTaskExecutorModelId({
    explicitExecutorModelId: data.executorModelId,
    assistantId: data.assistantId,
  })
  const budget = createDefaultTaskTokenBudget(
    inferTaskBudgetPresetForModels(plannerModelId, executorModelId),
  )

  const task = createAgentTaskRecord({
    workspaceId: data.workspaceId,
    assistantId: data.assistantId,
    sessionId: data.sessionId,
    title: data.title,
    goal: data.goal ?? data.title,
    plannerModelId,
    executorModelId,
    workspaceRoot: data.workspaceRoot,
    notes: data.notes,
    budget,
  })

  const wdMetadata = buildTaskWorkingDirectoryMetadata(task)
  const taskWithMetadata =
    Object.keys(wdMetadata).length > 0
      ? updateAgentTaskRecord(task.id, {
          metadata: { ...task.metadata, ...wdMetadata },
        })
      : task

  if (data.sessionId) {
    bindTaskToSession(data.sessionId, taskWithMetadata.id)
  }
  logStructured('task-runtime', 'info', `task created: ${taskWithMetadata.id} title=${taskWithMetadata.title}`)
  emitTaskStarted(taskWithMetadata)
  return taskWithMetadata
}

export function getTask(input: unknown): AgentTask | null {
  const data = TaskGetInputSchema.parse(input)
  return getAgentTask(data.taskId)
}

function mergeTasksByRecency(primary: AgentTask[], extra: AgentTask[]): AgentTask[] {
  const merged = new Map<string, AgentTask>()
  for (const task of [...primary, ...extra]) {
    const existing = merged.get(task.id)
    if (!existing || task.updatedAt > existing.updatedAt) {
      merged.set(task.id, task)
    }
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listTasks(input: unknown): TaskListOutput {
  const data = TaskListInputSchema.parse(input)
  const limit = data.pagination?.limit ?? 20
  const fetchLimit = limit * 2

  let items: AgentTask[] = []
  if (data.sessionId && data.assistantId) {
    items = mergeTasksByRecency(
      listAgentTasksBySession(data.sessionId, fetchLimit),
      listAgentTasksByAssistant(data.assistantId, fetchLimit),
    )
  } else if (data.sessionId) {
    items = mergeTasksByRecency(
      listAgentTasksBySession(data.sessionId, fetchLimit),
      listAgentTasksByWorkspace(data.workspaceId, fetchLimit),
    )
  } else if (data.assistantId) {
    items = listAgentTasksByAssistant(data.assistantId, fetchLimit)
  } else {
    items = listAgentTasksByWorkspace(data.workspaceId, fetchLimit)
  }

  if (data.status) {
    items = items.filter((task) => task.status === data.status)
  }

  items = items.filter((task) => task.workspaceId === data.workspaceId)

  return {
    items: items.slice(0, limit),
  }
}

export function releaseSessionTaskBinding(input: unknown): { released: boolean } {
  const data = TaskReleaseSessionBindingInputSchema.parse(input)
  const session = getSessionRepository().findRowById(data.sessionId)
  if (!session) {
    throw new Error('话题不存在')
  }

  if (clearStaleTerminalSessionBinding(data.sessionId)) {
    return { released: true }
  }

  let metadata: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(session.metadataJson) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>
    }
  } catch {
    metadata = {}
  }

  const taskId = parseSessionActiveTaskId(metadata)
  if (!taskId) {
    return { released: false }
  }

  return { released: unbindTaskFromSession(data.sessionId, taskId) }
}

function readPausedFromStatus(metadata: Record<string, unknown>): TaskStatus | undefined {
  const raw = metadata[TASK_PAUSED_FROM_STATUS_KEY]
  if (typeof raw !== 'string') return undefined
  const allowed: TaskStatus[] = ['pending', 'planning', 'executing', 'reflecting', 'retrying']
  return allowed.includes(raw as TaskStatus) ? (raw as TaskStatus) : undefined
}

export function controlTask(input: unknown): TaskControlOutput {
  const data = TaskControlInputSchema.parse(input)
  const existing = getAgentTask(data.taskId)
  if (!existing) {
    throw taskNotFound()
  }

  switch (data.action) {
    case 'pause': {
      assertTaskPauseTransition(existing.status)
      cancelScheduledTaskRun(existing.id)
      abortTaskWorkerRun(existing.id)
      const metadata = {
        ...existing.metadata,
        [TASK_PAUSED_FROM_STATUS_KEY]: existing.status,
      }
      if (isActiveTaskStatus(existing.status)) {
        releaseAgentTaskLock(existing.id)
      }
      const task = updateAgentTaskRecord(existing.id, {
        status: 'paused',
        metadata,
      })
      logStructured('task-runtime', 'info', `task paused: ${task.id}`)
      emitTaskPaused(task, existing.status)
      return { task }
    }
    case 'resume': {
      assertTaskResumeTransition(existing.status)
      const pausedFrom = readPausedFromStatus(existing.metadata)
      const nextStatus = resolveResumeTaskStatus(pausedFrom)
      const metadata = { ...existing.metadata }
      delete metadata[TASK_PAUSED_FROM_STATUS_KEY]
      const task = updateAgentTaskRecord(existing.id, {
        status: nextStatus,
        metadata,
      })
      logStructured('task-runtime', 'info', `task resumed: ${task.id} -> ${nextStatus}`)
      emitTaskResumed(task, nextStatus)
      const normalized = normalizeInterruptedTask(task)
      if (isTaskResumable(normalized)) {
        const skipPlan = normalized.history.length > 0 && hasPendingToolSteps(normalized)
        enqueueTaskRun(normalized.id, {
          skipPlan,
          workerId: `control-${normalized.id.slice(0, 8)}`,
        })
      }
      return { task: normalized }
    }
    case 'cancel': {
      assertTaskCancelTransition(existing.status)
      cancelScheduledTaskRun(existing.id)
      abortTaskWorkerRun(existing.id)
      const task = cancelAgentTask(existing.id)
      if (!task) {
        throw taskNotFound()
      }
      logStructured('task-runtime', 'info', `task cancelled: ${task.id}`)
      emitTaskFinished(task, 'cancelled')
      return { task }
    }
    default:
      throw new Error(`未知操作: ${String(data.action)}`)
  }
}

export { TaskStateError }
