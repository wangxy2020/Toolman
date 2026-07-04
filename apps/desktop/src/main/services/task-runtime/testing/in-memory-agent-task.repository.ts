import { randomUUID } from 'node:crypto'

import {
  type AgentTask,
  type TaskStatus,
  type TaskStepRecord,
  type TaskTokenBudget,
  createTaskTokenBudgetForModel,
  isActiveTaskStatus,
} from '@toolman/shared'

export class InMemoryAgentTaskRepository {
  private readonly tasks = new Map<string, AgentTask>()
  private lock: { taskId: string; workerId: string; acquiredAt: number } | null = null

  getById(id: string): AgentTask | null {
    const task = this.tasks.get(id)
    return task ? cloneTask(task) : null
  }

  findRowById(id: string): { id: string } | null {
    return this.tasks.has(id) ? { id } : null
  }

  listByAssistant(assistantId: string, limit = 100): AgentTask[] {
    return [...this.tasks.values()]
      .filter((task) => task.assistantId === assistantId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map(cloneTask)
  }

  listByWorkspace(workspaceId: string, limit = 100): AgentTask[] {
    return [...this.tasks.values()]
      .filter((task) => task.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map(cloneTask)
  }

  listBySession(sessionId: string, limit = 50): AgentTask[] {
    return [...this.tasks.values()]
      .filter((task) => task.sessionId === sessionId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map(cloneTask)
  }

  create(input: {
    workspaceId: string
    title: string
    assistantId?: string
    sessionId?: string
    goal?: string
    plannerModelId?: string
    executorModelId?: string
    workspaceRoot?: string
    notes?: string
    budget?: TaskTokenBudget
    metadata?: Record<string, unknown>
  }): AgentTask {
    const now = Date.now()
    const task: AgentTask = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      assistantId: input.assistantId,
      sessionId: input.sessionId,
      title: input.title,
      goal: input.goal,
      status: 'pending',
      retryCount: 0,
      plannerModelId: input.plannerModelId,
      executorModelId: input.executorModelId,
      workspaceRoot: input.workspaceRoot,
      history: [],
      budget: input.budget ?? createTaskTokenBudgetForModel(input.executorModelId ?? input.plannerModelId),
      notes: input.notes,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    }
    this.tasks.set(task.id, cloneTask(task))
    return cloneTask(task)
  }

  importLegacyTask(input: {
    id: string
    workspaceId: string
    assistantId?: string
    title: string
    status: TaskStatus
    notes?: string
    executorModelId?: string
    createdAt: number
    updatedAt: number
    metadata?: Record<string, unknown>
  }): AgentTask {
    if (this.tasks.has(input.id)) {
      return this.getById(input.id)!
    }

    const task: AgentTask = {
      id: input.id,
      workspaceId: input.workspaceId,
      assistantId: input.assistantId,
      title: input.title,
      goal: input.title,
      status: input.status,
      retryCount: 0,
      executorModelId: input.executorModelId,
      history: [],
      budget: createTaskTokenBudgetForModel(input.executorModelId),
      notes: input.notes,
      metadata: { ...(input.metadata ?? {}), legacyImport: true },
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }
    this.tasks.set(task.id, cloneTask(task))
    return cloneTask(task)
  }

  update(
    id: string,
    patch: {
      title?: string
      goal?: string
      status?: TaskStatus
      currentStepId?: string | null
      retryCount?: number
      plannerModelId?: string | null
      executorModelId?: string | null
      workspaceRoot?: string | null
      history?: TaskStepRecord[]
      budget?: TaskTokenBudget
      notes?: string | null
      metadata?: Record<string, unknown>
    },
  ): AgentTask {
    const existing = this.tasks.get(id)
    if (!existing) {
      throw new Error('任务不存在')
    }

    const updated: AgentTask = {
      ...existing,
      ...patch,
      currentStepId: patch.currentStepId === null ? undefined : (patch.currentStepId ?? existing.currentStepId),
      plannerModelId: patch.plannerModelId === null ? undefined : (patch.plannerModelId ?? existing.plannerModelId),
      executorModelId: patch.executorModelId === null ? undefined : (patch.executorModelId ?? existing.executorModelId),
      workspaceRoot: patch.workspaceRoot === null ? undefined : (patch.workspaceRoot ?? existing.workspaceRoot),
      notes: patch.notes === null ? undefined : (patch.notes ?? existing.notes),
      history: patch.history ?? existing.history,
      budget: patch.budget ?? existing.budget,
      metadata: patch.metadata ?? existing.metadata,
      updatedAt: Date.now(),
    }

    this.tasks.set(id, cloneTask(updated))
    return cloneTask(updated)
  }

  getGlobalLock(): { taskId: string; workerId: string; acquiredAt: number } | null {
    return this.lock ? { ...this.lock } : null
  }

  tryAcquireGlobalLock(taskId: string, workerId: string): boolean {
    if (this.lock && this.lock.taskId !== taskId) {
      const holder = this.tasks.get(this.lock.taskId)
      if (holder && isActiveTaskStatus(holder.status)) {
        return false
      }
      this.lock = null
    }

    this.lock = { taskId, workerId, acquiredAt: Date.now() }
    return true
  }

  releaseGlobalLock(taskId: string): void {
    if (this.lock?.taskId === taskId) {
      this.lock = null
    }
  }
}

function cloneTask(task: AgentTask): AgentTask {
  return {
    ...task,
    history: task.history.map((step) => ({ ...step })),
    budget: { ...task.budget, used: { ...task.budget.used } },
    metadata: { ...task.metadata },
  }
}

export function createInMemoryAgentTaskRepository(): InMemoryAgentTaskRepository {
  return new InMemoryAgentTaskRepository()
}
