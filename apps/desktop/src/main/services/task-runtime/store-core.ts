import { randomUUID } from 'node:crypto'

import {
  type AgentTask,
  type LegacyAgentTaskStatus,
  type TaskStatus,
  type TaskStepRecord,
  legacyTaskStatusToTaskStatus,
  taskStatusToLegacyStatus,
} from '@toolman/shared'
import { AgentTaskRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { getAssistantRow } from '../assistant.service'
import { syncTaskSnapshotFromDb } from './snapshot'
import { buildTaskWorkspacePatch } from './task-workspace.service'

export function finalizeTaskWorkspace(
  task: AgentTask,
  options?: {
    explicitWorkspaceRoot?: string
    assistantId?: string
  },
): AgentTask {
  const patch = buildTaskWorkspacePatch(task, options)
  if (!patch) {
    return task
  }
  return updateAgentTaskRecord(task.id, {
    workspaceRoot: patch.workspaceRoot,
    metadata: patch.metadata,
  })
}

export function repairTaskWorkspaceRecord(task: AgentTask): AgentTask {
  return finalizeTaskWorkspace(task, {
    explicitWorkspaceRoot: task.workspaceRoot,
    assistantId: task.assistantId,
  })
}

export type { AgentTask, TaskStatus, LegacyAgentTaskStatus }

/** @deprecated Use AgentTask from @toolman/shared */
export interface LegacyAgentTaskListItem {
  id: string
  title: string
  status: LegacyAgentTaskStatus
  notes?: string
  createdAt: number
  updatedAt: number
}

export function getRepo(): AgentTaskRepository {
  return new AgentTaskRepository(getDatabase())
}

function toLegacyItem(task: AgentTask): LegacyAgentTaskListItem {
  return {
    id: task.id,
    title: task.title,
    status: taskStatusToLegacyStatus(task.status),
    notes: task.notes,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

export function getAgentTask(taskId: string): AgentTask | null {
  return getRepo().getById(taskId)
}

export function listAgentTasksByAssistant(assistantId: string, limit = 100): AgentTask[] {
  return getRepo().listByAssistant(assistantId, limit)
}

export function listAgentTasksByWorkspace(workspaceId: string, limit = 100): AgentTask[] {
  return getRepo().listByWorkspace(workspaceId, limit)
}

export function listAgentTasksBySession(sessionId: string, limit = 50): AgentTask[] {
  return getRepo().listBySession(sessionId, limit)
}

export interface CreateAgentTaskRuntimeInput {
  workspaceId: string
  assistantId?: string
  sessionId?: string
  title: string
  goal?: string
  plannerModelId?: string
  executorModelId?: string
  workspaceRoot?: string
  notes?: string
  budget?: import('@toolman/shared').TaskTokenBudget
}

export function createAgentTaskRecord(input: CreateAgentTaskRuntimeInput): AgentTask {
  const title = input.title.trim()
  if (!title) {
    throw new Error('任务标题不能为空')
  }

  const task = getRepo().create({
    workspaceId: input.workspaceId,
    assistantId: input.assistantId,
    sessionId: input.sessionId,
    title,
    goal: input.goal,
    plannerModelId: input.plannerModelId,
    executorModelId: input.executorModelId,
    workspaceRoot: input.workspaceRoot,
    notes: input.notes,
    budget: input.budget,
  })

  const finalized = finalizeTaskWorkspace(task, {
    explicitWorkspaceRoot: input.workspaceRoot,
    assistantId: input.assistantId,
  })
  syncTaskSnapshotFromDb(finalized)
  return finalized
}

export function updateAgentTaskRecord(
  taskId: string,
  patch: Parameters<AgentTaskRepository['update']>[1],
): AgentTask {
  const task = getRepo().update(taskId, patch)
  syncTaskSnapshotFromDb(task)
  return task
}

export function cancelAgentTask(taskId: string): AgentTask | null {
  const existing = getRepo().getById(taskId)
  if (!existing) return null
  const task = getRepo().update(taskId, { status: 'cancelled' })
  getRepo().releaseGlobalLock(taskId)
  syncTaskSnapshotFromDb(task)
  return task
}

export function releaseAgentTaskLock(taskId: string): void {
  getRepo().releaseGlobalLock(taskId)
}

export function getGlobalAgentTaskLock(): { taskId: string; workerId: string; acquiredAt: number } | null {
  return getRepo().getGlobalLock()
}

export function tryAcquireAgentTaskLock(taskId: string, workerId: string): boolean {
  return getRepo().tryAcquireGlobalLock(taskId, workerId)
}

export function appendTaskToolSteps(
  taskId: string,
  steps: Array<{
    toolName: string
    argsJson: string
    toolCallId?: string
    title?: string
  }>,
): AgentTask {
  const task = getAgentTask(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  if (steps.length === 0) {
    return task
  }

  const newSteps: TaskStepRecord[] = steps.map((step) => ({
    id: randomUUID(),
    kind: 'tool',
    title: step.title?.trim() || step.toolName,
    status: 'pending',
    input: {
      toolName: step.toolName,
      argsJson: step.argsJson,
      toolCallId: step.toolCallId,
    },
    retryCount: 0,
  }))

  return updateAgentTaskRecord(taskId, {
    history: [...task.history, ...newSteps],
  })
}

export function replaceTaskPendingSteps(taskId: string, steps: TaskStepRecord[]): AgentTask {
  const task = getAgentTask(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  const preserved = task.history.filter((step) => step.status !== 'pending')
  return updateAgentTaskRecord(taskId, {
    history: [...preserved, ...steps],
  })
}

// ---------------------------------------------------------------------------
// Legacy adapter (agent_task_* tools)
// ---------------------------------------------------------------------------

export function listAgentTasks(assistantId: string): LegacyAgentTaskListItem[] {
  return listAgentTasksByAssistant(assistantId).map(toLegacyItem)
}

export function createAgentTask(
  assistantId: string,
  title: string,
  notes?: string,
): LegacyAgentTaskListItem {
  const assistant = getAssistantRow(assistantId)
  if (!assistant) {
    throw new Error('智能体不存在')
  }

  const task = createAgentTaskRecord({
    workspaceId: assistant.workspaceId,
    assistantId,
    title,
    notes,
    executorModelId: assistant.modelId,
  })
  return toLegacyItem(task)
}

export function updateAgentTask(
  assistantId: string,
  taskId: string,
  patch: Partial<Pick<LegacyAgentTaskListItem, 'title' | 'status' | 'notes'>>,
): LegacyAgentTaskListItem {
  const existing = getRepo().getById(taskId)
  if (!existing || existing.assistantId !== assistantId) {
    throw new Error('任务不存在')
  }

  const task = updateAgentTaskRecord(taskId, {
    title: patch.title,
    notes: patch.notes,
    status: patch.status ? legacyTaskStatusToTaskStatus(patch.status) : undefined,
  })
  return toLegacyItem(task)
}

export function formatAgentTasks(assistantId: string): string {
  const tasks = listAgentTasks(assistantId)
  if (tasks.length === 0) return '当前没有任务。'

  return tasks
    .slice(0, 20)
    .map(
      (task) =>
        `- [${task.status}] ${task.title} (id: ${task.id})${task.notes ? ` — ${task.notes}` : ''}`,
    )
    .join('\n')
}

