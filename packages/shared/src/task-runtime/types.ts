import { z } from 'zod'

export const TaskStatusSchema = z.enum([
  'pending',
  'planning',
  'executing',
  'reflecting',
  'retrying',
  'paused',
  'completed',
  'failed',
  'cancelled',
])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

/** @deprecated Legacy task-store status; map via legacyTaskStatusToTaskStatus */
export const LegacyAgentTaskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
])
export type LegacyAgentTaskStatus = z.infer<typeof LegacyAgentTaskStatusSchema>

export const TaskStepKindSchema = z.enum([
  'scan',
  'classify',
  'read',
  'index',
  'transform',
  'output',
  'report',
  'tool',
  'custom',
])
export type TaskStepKind = z.infer<typeof TaskStepKindSchema>

export const TaskStepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
])
export type TaskStepStatus = z.infer<typeof TaskStepStatusSchema>

export const TaskStepRecordSchema = z.object({
  id: z.string().uuid(),
  kind: TaskStepKindSchema,
  title: z.string().min(1),
  status: TaskStepStatusSchema,
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
})
export type TaskStepRecord = z.infer<typeof TaskStepRecordSchema>

export const TaskTokenBudgetPresetSchema = z.enum(['local', 'network', 'custom'])
export type TaskTokenBudgetPreset = z.infer<typeof TaskTokenBudgetPresetSchema>

export const TaskTokenBudgetUsageSchema = z.object({
  planner: z.number().int().nonnegative().default(0),
  executor: z.number().int().nonnegative().default(0),
  reflection: z.number().int().nonnegative().default(0),
  total: z.number().int().nonnegative().default(0),
})

export const TaskTokenBudgetSchema = z.object({
  preset: TaskTokenBudgetPresetSchema,
  maxPlannerTokens: z.number().int().positive(),
  maxExecutorTokensPerStep: z.number().int().positive(),
  maxReflectionTokens: z.number().int().positive(),
  maxTotalTokens: z.number().int().positive(),
  maxSteps: z.number().int().positive(),
  used: TaskTokenBudgetUsageSchema,
})
export type TaskTokenBudget = z.infer<typeof TaskTokenBudgetSchema>

export const AgentTaskSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  assistantId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  title: z.string().min(1),
  goal: z.string().optional(),
  status: TaskStatusSchema,
  currentStepId: z.string().uuid().optional(),
  retryCount: z.number().int().nonnegative(),
  plannerModelId: z.string().optional(),
  executorModelId: z.string().optional(),
  workspaceRoot: z.string().optional(),
  history: z.array(TaskStepRecordSchema),
  budget: TaskTokenBudgetSchema,
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type AgentTask = z.infer<typeof AgentTaskSchema>

export const TaskSnapshotSchema = z.object({
  snapshotVersion: z.literal(1),
  task: AgentTaskSchema,
  syncedAt: z.number().int().nonnegative(),
})
export type TaskSnapshot = z.infer<typeof TaskSnapshotSchema>

export const AGENT_TASK_LOCK_SCOPE_GLOBAL = 'global' as const

export const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = [
  'planning',
  'executing',
  'reflecting',
  'retrying',
] as const

export function legacyTaskStatusToTaskStatus(status: LegacyAgentTaskStatus): TaskStatus {
  switch (status) {
    case 'in_progress':
      return 'executing'
    default:
      return status
  }
}

export function taskStatusToLegacyStatus(status: TaskStatus): LegacyAgentTaskStatus {
  switch (status) {
    case 'planning':
    case 'executing':
    case 'reflecting':
    case 'retrying':
    case 'paused':
    case 'failed':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    case 'pending':
    default:
      return 'pending'
  }
}

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return (ACTIVE_TASK_STATUSES as readonly string[]).includes(status)
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
