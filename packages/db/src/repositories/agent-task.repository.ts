import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  AGENT_TASK_LOCK_SCOPE_GLOBAL,
  AgentTaskSchema,
  type AgentTask,
  type TaskStatus,
  type TaskStepRecord,
  type TaskTokenBudget,
  createTaskTokenBudgetForModel,
  isActiveTaskStatus,
} from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { agentTaskLock, agentTasks } from '../schema/task-runtime.js'

export type AgentTaskRow = typeof agentTasks.$inferSelect

export interface CreateAgentTaskInput {
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
}

export interface UpdateAgentTaskPatch {
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
}

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

function parseJsonObject<T extends Record<string, unknown>>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T
    }
    return fallback
  } catch {
    return fallback
  }
}

export function rowToAgentTask(row: AgentTaskRow): AgentTask {
  const budgetRaw = parseJsonObject<Record<string, unknown>>(row.budgetJson, {})
  const budget =
    budgetRaw.preset != null
      ? (budgetRaw as TaskTokenBudget)
      : createTaskTokenBudgetForModel(row.executorModelId ?? row.plannerModelId)

  return AgentTaskSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    assistantId: row.assistantId ?? undefined,
    sessionId: row.sessionId ?? undefined,
    title: row.title,
    goal: row.goal ?? undefined,
    status: row.status,
    currentStepId: row.currentStepId ?? undefined,
    retryCount: row.retryCount,
    plannerModelId: row.plannerModelId ?? undefined,
    executorModelId: row.executorModelId ?? undefined,
    workspaceRoot: row.workspaceRoot ?? undefined,
    history: parseJsonArray<TaskStepRecord>(row.historyJson, []),
    budget,
    notes: row.notes ?? undefined,
    metadata: parseJsonObject(row.metadataJson, {}),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export class AgentTaskRepository {
  constructor(private readonly db: ToolmanDatabase) {}

  findRowById(id: string): AgentTaskRow | null {
    const row = this.db.select().from(agentTasks).where(eq(agentTasks.id, id)).get()
    if (!row || row.deletedAt) return null
    return row
  }

  getById(id: string): AgentTask | null {
    const row = this.findRowById(id)
    return row ? rowToAgentTask(row) : null
  }

  listByAssistant(assistantId: string, limit = 100): AgentTask[] {
    return this.db
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.assistantId, assistantId), isNull(agentTasks.deletedAt)))
      .orderBy(desc(agentTasks.updatedAt))
      .limit(limit)
      .all()
      .map(rowToAgentTask)
  }

  listByWorkspace(workspaceId: string, limit = 100): AgentTask[] {
    return this.db
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.workspaceId, workspaceId), isNull(agentTasks.deletedAt)))
      .orderBy(desc(agentTasks.updatedAt))
      .limit(limit)
      .all()
      .map(rowToAgentTask)
  }

  listBySession(sessionId: string, limit = 50): AgentTask[] {
    return this.db
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.sessionId, sessionId), isNull(agentTasks.deletedAt)))
      .orderBy(desc(agentTasks.updatedAt))
      .limit(limit)
      .all()
      .map(rowToAgentTask)
  }

  create(input: CreateAgentTaskInput): AgentTask {
    const now = new Date()
    const id = randomUUID()
    return this.insertTask(id, now, input)
  }

  importLegacyTask(input: CreateAgentTaskInput & {
    id: string
    status: TaskStatus
    createdAt: number
    updatedAt: number
    retryCount?: number
    metadata?: Record<string, unknown>
  }): AgentTask {
    if (this.findRowById(input.id)) {
      return this.getById(input.id)!
    }
    const createdAt = new Date(input.createdAt)
    const updatedAt = new Date(input.updatedAt)
    return this.insertTask(input.id, createdAt, input, {
      status: input.status,
      retryCount: input.retryCount ?? 0,
      updatedAt,
      metadata: { ...(input.metadata ?? {}), legacyImport: true },
    })
  }

  private insertTask(
    id: string,
    createdAt: Date,
    input: CreateAgentTaskInput,
    overrides?: {
      status?: TaskStatus
      retryCount?: number
      updatedAt?: Date
      metadata?: Record<string, unknown>
    },
  ): AgentTask {
    const now = overrides?.updatedAt ?? createdAt
    const budget =
      input.budget ??
      createTaskTokenBudgetForModel(input.executorModelId ?? input.plannerModelId)

    this.db
      .insert(agentTasks)
      .values({
        id,
        workspaceId: input.workspaceId,
        assistantId: input.assistantId ?? null,
        sessionId: input.sessionId ?? null,
        title: input.title.trim(),
        goal: input.goal?.trim() || null,
        status: overrides?.status ?? 'pending',
        currentStepId: null,
        retryCount: overrides?.retryCount ?? 0,
        plannerModelId: input.plannerModelId?.trim() || null,
        executorModelId: input.executorModelId?.trim() || null,
        workspaceRoot: input.workspaceRoot?.trim() || null,
        historyJson: '[]',
        budgetJson: JSON.stringify(budget),
        notes: input.notes?.trim() || null,
        metadataJson: JSON.stringify(overrides?.metadata ?? input.metadata ?? {}),
        createdAt,
        updatedAt: now,
      })
      .run()

    return this.getById(id)!
  }

  update(id: string, patch: UpdateAgentTaskPatch): AgentTask {
    const row = this.findRowById(id)
    if (!row) {
      throw new Error('任务不存在')
    }

    const now = new Date()
    const nextMetadata =
      patch.metadata !== undefined
        ? JSON.stringify(patch.metadata)
        : undefined

    this.db
      .update(agentTasks)
      .set({
        title: patch.title?.trim() || undefined,
        goal: patch.goal !== undefined ? patch.goal.trim() || null : undefined,
        status: patch.status,
        currentStepId:
          patch.currentStepId !== undefined ? patch.currentStepId : undefined,
        retryCount: patch.retryCount,
        plannerModelId:
          patch.plannerModelId !== undefined ? patch.plannerModelId : undefined,
        executorModelId:
          patch.executorModelId !== undefined ? patch.executorModelId : undefined,
        workspaceRoot:
          patch.workspaceRoot !== undefined ? patch.workspaceRoot : undefined,
        historyJson: patch.history !== undefined ? JSON.stringify(patch.history) : undefined,
        budgetJson: patch.budget !== undefined ? JSON.stringify(patch.budget) : undefined,
        notes: patch.notes !== undefined ? patch.notes : undefined,
        metadataJson: nextMetadata,
        updatedAt: now,
      })
      .where(eq(agentTasks.id, id))
      .run()

    return this.getById(id)!
  }

  softDelete(id: string): boolean {
    const row = this.findRowById(id)
    if (!row) return false
    this.db
      .update(agentTasks)
      .set({ deletedAt: new Date(), updatedAt: new Date(), status: 'cancelled' })
      .where(eq(agentTasks.id, id))
      .run()
    return true
  }

  getGlobalLock(): { taskId: string; workerId: string; acquiredAt: number } | null {
    const row = this.db
      .select()
      .from(agentTaskLock)
      .where(eq(agentTaskLock.id, AGENT_TASK_LOCK_SCOPE_GLOBAL))
      .get()
    if (!row) return null
    return {
      taskId: row.taskId,
      workerId: row.workerId,
      acquiredAt: row.acquiredAt.getTime(),
    }
  }

  /** Acquire global lock; fails if another active task holds it. */
  tryAcquireGlobalLock(taskId: string, workerId: string): boolean {
    const task = this.getById(taskId)
    if (!task) {
      throw new Error('任务不存在')
    }

    const existing = this.getGlobalLock()
    if (existing && existing.taskId !== taskId) {
      const holder = this.getById(existing.taskId)
      if (holder && isActiveTaskStatus(holder.status)) {
        return false
      }
      this.releaseGlobalLock(existing.taskId)
    }

    const now = new Date()
    this.db
      .insert(agentTaskLock)
      .values({
        id: AGENT_TASK_LOCK_SCOPE_GLOBAL,
        taskId,
        workerId,
        acquiredAt: now,
      })
      .onConflictDoUpdate({
        target: agentTaskLock.id,
        set: { taskId, workerId, acquiredAt: now },
      })
      .run()

    return true
  }

  releaseGlobalLock(taskId: string): void {
    const existing = this.getGlobalLock()
    if (!existing || existing.taskId !== taskId) {
      return
    }
    this.db.delete(agentTaskLock).where(eq(agentTaskLock.id, AGENT_TASK_LOCK_SCOPE_GLOBAL)).run()
  }
}
