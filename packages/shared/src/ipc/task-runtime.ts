import { z } from 'zod'

import { PdfParserBackendSchema } from '../document-parser.js'
import { OdlHybridSettingsPatchSchema } from '../odl-hybrid.js'
import {
  AgentTaskSchema,
  TaskStatusSchema,
  TaskTokenBudgetSchema,
} from '../task-runtime/types.js'
import { TaskToolStepInputSchema, TaskToolStepPayloadSchema } from '../task-runtime/executor-step.js'
import { TaskPlanSchema, TaskPlanStepSchema } from '../task-runtime/plan.js'
import { TaskReflectionResultSchema } from '../task-runtime/reflection.js'
import { TaskArtifactKindSchema, TaskArtifactSchema, TaskArtifactSourceSchema } from '../task-runtime/artifact.js'
import { TaskEventSchema, TaskReflectionVerdictSchema } from '../task-runtime/events.js'
import { PaginationSchema, UuidSchema } from './base.js'

export const AgentTaskDtoSchema = AgentTaskSchema
export type AgentTaskDto = z.infer<typeof AgentTaskDtoSchema>

export const TaskCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  assistantId: UuidSchema.optional(),
  sessionId: UuidSchema.optional(),
  title: z.string().min(1).max(200),
  goal: z.string().max(8000).optional(),
  plannerModelId: z.string().min(1).optional(),
  executorModelId: z.string().min(1).optional(),
  workspaceRoot: z.string().min(1).optional(),
  notes: z.string().max(4000).optional(),
})
export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>

export const TaskGetInputSchema = z.object({
  taskId: UuidSchema,
})
export type TaskGetInput = z.infer<typeof TaskGetInputSchema>

export const TaskListInputSchema = z.object({
  workspaceId: UuidSchema,
  assistantId: UuidSchema.optional(),
  sessionId: UuidSchema.optional(),
  status: TaskStatusSchema.optional(),
  pagination: PaginationSchema.optional(),
})
export type TaskListInput = z.infer<typeof TaskListInputSchema>

export const TaskListOutputSchema = z.object({
  items: z.array(AgentTaskDtoSchema),
  nextCursor: z.string().optional(),
})
export type TaskListOutput = z.infer<typeof TaskListOutputSchema>

export const TaskControlActionSchema = z.enum(['pause', 'resume', 'cancel'])
export type TaskControlAction = z.infer<typeof TaskControlActionSchema>

export const TaskControlInputSchema = z.object({
  taskId: UuidSchema,
  action: TaskControlActionSchema,
})
export type TaskControlInput = z.infer<typeof TaskControlInputSchema>

export const TaskControlOutputSchema = z.object({
  task: AgentTaskDtoSchema,
})
export type TaskControlOutput = z.infer<typeof TaskControlOutputSchema>

export const TaskReleaseSessionBindingInputSchema = z.object({
  sessionId: UuidSchema,
})
export type TaskReleaseSessionBindingInput = z.infer<typeof TaskReleaseSessionBindingInputSchema>

export const TaskReleaseSessionBindingOutputSchema = z.object({
  released: z.boolean(),
})
export type TaskReleaseSessionBindingOutput = z.infer<typeof TaskReleaseSessionBindingOutputSchema>

export const TaskArtifactRegisterInputSchema = z.object({
  taskId: UuidSchema,
  sourcePath: z.string().min(1),
  name: z.string().min(1).max(256).optional(),
  kind: TaskArtifactKindSchema.optional(),
  copy: z.boolean().optional(),
  source: TaskArtifactSourceSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
})
export type TaskArtifactRegisterInput = z.infer<typeof TaskArtifactRegisterInputSchema>

export const TaskArtifactListInputSchema = z.object({
  taskId: UuidSchema,
  pagination: PaginationSchema.optional(),
})
export type TaskArtifactListInput = z.infer<typeof TaskArtifactListInputSchema>

export const TaskArtifactListOutputSchema = z.object({
  items: z.array(TaskArtifactSchema),
})
export type TaskArtifactListOutput = z.infer<typeof TaskArtifactListOutputSchema>

export const TaskArtifactGetInputSchema = z.object({
  taskId: UuidSchema,
  artifactId: UuidSchema,
})
export type TaskArtifactGetInput = z.infer<typeof TaskArtifactGetInputSchema>

export const TaskArtifactDeleteInputSchema = z.object({
  taskId: UuidSchema,
  artifactId: UuidSchema,
})
export type TaskArtifactDeleteInput = z.infer<typeof TaskArtifactDeleteInputSchema>

export const TaskArtifactRegisterOutputSchema = z.object({
  artifact: TaskArtifactSchema,
})
export type TaskArtifactRegisterOutput = z.infer<typeof TaskArtifactRegisterOutputSchema>

export const TaskEventListInputSchema = z.object({
  taskId: UuidSchema,
  limit: z.number().int().min(1).max(500).optional(),
})
export type TaskEventListInput = z.infer<typeof TaskEventListInputSchema>

export const TaskEventListOutputSchema = z.object({
  items: z.array(TaskEventSchema),
})
export type TaskEventListOutput = z.infer<typeof TaskEventListOutputSchema>

export const TaskEventClearInputSchema = z.object({
  taskId: UuidSchema,
})
export type TaskEventClearInput = z.infer<typeof TaskEventClearInputSchema>

export const TaskEventClearOutputSchema = z.object({
  cleared: z.literal(true),
})
export type TaskEventClearOutput = z.infer<typeof TaskEventClearOutputSchema>

export { TaskEventSchema }

export const TaskExecuteInputSchema = z.object({
  taskId: UuidSchema,
  workerId: z.string().min(1).optional(),
  steps: z.array(TaskToolStepInputSchema).optional(),
})
export type TaskExecuteInput = z.infer<typeof TaskExecuteInputSchema>

export const TaskExecuteOutputSchema = z.object({
  task: AgentTaskDtoSchema,
})
export type TaskExecuteOutput = z.infer<typeof TaskExecuteOutputSchema>

export const TaskPlanInputSchema = z.object({
  taskId: UuidSchema,
  workerId: z.string().min(1).optional(),
  execute: z.boolean().optional(),
})
export type TaskPlanInput = z.infer<typeof TaskPlanInputSchema>

export const TaskPlanOutputSchema = z.object({
  task: AgentTaskDtoSchema,
})
export type TaskPlanOutput = z.infer<typeof TaskPlanOutputSchema>

export const TaskReflectInputSchema = z.object({
  taskId: UuidSchema,
  workerId: z.string().min(1).optional(),
  stepId: UuidSchema.optional(),
})
export type TaskReflectInput = z.infer<typeof TaskReflectInputSchema>

export const TaskReflectOutputSchema = z.object({
  task: AgentTaskDtoSchema,
  reflection: TaskReflectionResultSchema,
  verdict: TaskReflectionVerdictSchema,
})
export type TaskReflectOutput = z.infer<typeof TaskReflectOutputSchema>

export const TaskRunInputSchema = z.object({
  taskId: UuidSchema,
  workerId: z.string().min(1).optional(),
  /** Skip planner even for fresh tasks (execute-only resume). */
  skipPlan: z.boolean().optional(),
})
export type TaskRunInput = z.infer<typeof TaskRunInputSchema>

export const TaskRunOutputSchema = z.object({
  task: AgentTaskDtoSchema,
})
export type TaskRunOutput = z.infer<typeof TaskRunOutputSchema>

export { TaskToolStepInputSchema, TaskToolStepPayloadSchema, TaskPlanSchema, TaskPlanStepSchema, TaskReflectionResultSchema }
export type { TaskToolStepInput, TaskToolStepPayload } from '../task-runtime/executor-step.js'
export type { TaskPlan, TaskPlanStep } from '../task-runtime/plan.js'
export type { TaskReflectionResult } from '../task-runtime/reflection.js'

export const RuntimeAppSettingsSyncInputSchema = z.object({
  documentOcrEnabled: z.boolean().optional(),
  pdfParserBackend: PdfParserBackendSchema.optional(),
  odlHybrid: OdlHybridSettingsPatchSchema.optional(),
  defaultDocProcessorProviderId: z.string().nullable().optional(),
  plannerModelId: z.string().nullable().optional(),
})

export const RuntimeAppSettingsSchema = z.object({
  documentOcrEnabled: z.boolean(),
  pdfParserBackend: PdfParserBackendSchema,
  defaultDocProcessorProviderId: z.string().nullable(),
  plannerModelId: z.string().nullable(),
})
export type RuntimeAppSettingsDto = z.infer<typeof RuntimeAppSettingsSchema>

/** Re-export for IPC consumers documenting task budget shape */
export { TaskTokenBudgetSchema }
