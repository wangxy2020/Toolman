import {
  AgentTaskSchema,
  type AgentTask,
  type TaskStatus,
  type TaskStepRecord,
  type TaskTokenBudget,
  createTaskTokenBudgetForModel,
} from '@toolman/shared'
import { agentTasks } from '../schema/task-runtime.js'

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
