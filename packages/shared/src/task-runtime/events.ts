import { z } from 'zod'

import { UuidSchema, TimestampSchema } from '../ipc/base.js'
import { TaskArtifactKindSchema } from './artifact.js'
import { TaskStatusSchema, TaskStepKindSchema } from './types.js'

export const TASK_EVENT_LOG_FILE = 'events.jsonl'

export const TaskEventTypeSchema = z.enum([
  'task.started',
  'task.step.started',
  'task.tool.started',
  'task.tool.finished',
  'task.retry',
  'task.checkpoint',
  'task.reflection',
  'task.artifact.created',
  'task.paused',
  'task.resumed',
  'task.finished',
])
export type TaskEventType = z.infer<typeof TaskEventTypeSchema>

const taskEventBaseSchema = {
  taskId: UuidSchema,
  workspaceId: UuidSchema,
  sessionId: UuidSchema.optional(),
  timestamp: TimestampSchema,
}

export const TaskReflectionVerdictSchema = z.enum(['pass', 'fail', 'replan'])
export type TaskReflectionVerdict = z.infer<typeof TaskReflectionVerdictSchema>

export const TaskEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task.started'),
    ...taskEventBaseSchema,
    title: z.string().min(1),
    status: TaskStatusSchema,
  }),
  z.object({
    type: z.literal('task.step.started'),
    ...taskEventBaseSchema,
    stepId: UuidSchema,
    stepKind: TaskStepKindSchema,
    stepTitle: z.string().min(1),
  }),
  z.object({
    type: z.literal('task.tool.started'),
    ...taskEventBaseSchema,
    stepId: UuidSchema.optional(),
    toolName: z.string().min(1),
    toolCallId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('task.tool.finished'),
    ...taskEventBaseSchema,
    stepId: UuidSchema.optional(),
    toolName: z.string().min(1),
    toolCallId: z.string().min(1).optional(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('task.retry'),
    ...taskEventBaseSchema,
    stepId: UuidSchema.optional(),
    retryCount: z.number().int().nonnegative(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('task.checkpoint'),
    ...taskEventBaseSchema,
    stepId: UuidSchema.optional(),
    checkpointPath: z.string().min(1),
  }),
  z.object({
    type: z.literal('task.reflection'),
    ...taskEventBaseSchema,
    stepId: UuidSchema.optional(),
    verdict: TaskReflectionVerdictSchema,
    summary: z.string().optional(),
  }),
  z.object({
    type: z.literal('task.artifact.created'),
    ...taskEventBaseSchema,
    artifactId: UuidSchema,
    name: z.string().min(1),
    kind: TaskArtifactKindSchema,
    absolutePath: z.string().min(1),
  }),
  z.object({
    type: z.literal('task.paused'),
    ...taskEventBaseSchema,
    fromStatus: TaskStatusSchema,
  }),
  z.object({
    type: z.literal('task.resumed'),
    ...taskEventBaseSchema,
    toStatus: TaskStatusSchema,
  }),
  z.object({
    type: z.literal('task.finished'),
    ...taskEventBaseSchema,
    status: z.enum(['completed', 'failed', 'cancelled']),
  }),
])

export type TaskEvent = z.infer<typeof TaskEventSchema>

export function taskEventBase(task: {
  id: string
  workspaceId: string
  sessionId?: string
}): Pick<TaskEvent, 'taskId' | 'workspaceId' | 'sessionId' | 'timestamp'> {
  return {
    taskId: task.id,
    workspaceId: task.workspaceId,
    sessionId: task.sessionId,
    timestamp: Date.now(),
  }
}
