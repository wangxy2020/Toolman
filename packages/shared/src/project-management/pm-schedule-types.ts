import { z } from 'zod'
import { UuidSchema } from '../ipc/base.js'

export const PmWorkItemRelationTypeSchema = z.enum(['FS', 'SS', 'FF', 'SF'])
export type PmWorkItemRelationType = z.infer<typeof PmWorkItemRelationTypeSchema>

export const PmWorkItemRelationSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  workspaceId: UuidSchema,
  fromWorkItemId: UuidSchema,
  toWorkItemId: UuidSchema,
  type: PmWorkItemRelationTypeSchema,
  lagDays: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type PmWorkItemRelation = z.infer<typeof PmWorkItemRelationSchema>

export const PmScheduleBaselineItemSchema = z.object({
  workItemId: UuidSchema,
  title: z.string(),
  startDate: z.number().int().optional(),
  dueDate: z.number().int().optional(),
  progressPercent: z.number().int().min(0).max(100),
})

export type PmScheduleBaselineItem = z.infer<typeof PmScheduleBaselineItemSchema>

export const PmScheduleBaselineSnapshotSchema = z.object({
  workItems: z.array(PmScheduleBaselineItemSchema),
  capturedAt: z.number().int(),
})

export type PmScheduleBaselineSnapshot = z.infer<typeof PmScheduleBaselineSnapshotSchema>

export const PmScheduleBaselineSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  workspaceId: UuidSchema,
  name: z.string().min(1).max(200),
  snapshot: PmScheduleBaselineSnapshotSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type PmScheduleBaseline = z.infer<typeof PmScheduleBaselineSchema>

export const PmCostLedgerRowSchema = z.object({
  projectCode: z.string(),
  projectName: z.string(),
  schedule: z.string().optional(),
  ipcNo: z.string().optional(),
  contractValue: z.number(),
  settledAmount: z.number(),
  pendingAmount: z.number(),
  progressPercent: z.number(),
  status: z.enum(['normal', 'warning', 'critical']),
})

export type PmCostLedgerRow = z.infer<typeof PmCostLedgerRowSchema>