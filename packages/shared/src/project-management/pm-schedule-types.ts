import { z } from 'zod'
import { UuidSchema } from '../ipc/base.js'
import { PmWorkItemTypeSchema } from './pm-types.js'

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
  startDate: z.number().int().optional().nullable().transform((value) => value ?? undefined),
  dueDate: z.number().int().optional().nullable().transform((value) => value ?? undefined),
  progressPercent: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .nullable()
    .transform((value) =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.min(100, Math.max(0, Math.floor(value)))
        : 0,
    ),
  /** Present on snapshots after unified versioning; used for structural restore. */
  parentWorkItemId: UuidSchema.optional().nullable().transform((value) => value ?? undefined),
  type: PmWorkItemTypeSchema.optional(),
  sortOrder: z.number().int().optional(),
})

export type PmScheduleBaselineItem = z.infer<typeof PmScheduleBaselineItemSchema>

/** Lightweight relation row stored inside a schedule/version baseline snapshot. */
export const PmScheduleBaselineRelationSchema = z.object({
  fromWorkItemId: UuidSchema,
  toWorkItemId: UuidSchema,
  type: PmWorkItemRelationTypeSchema.default('FS'),
  lagDays: z.number().int().default(0),
})

export type PmScheduleBaselineRelation = z.infer<typeof PmScheduleBaselineRelationSchema>

export const PmScheduleBaselineSnapshotSchema = z.object({
  workItems: z.array(PmScheduleBaselineItemSchema),
  capturedAt: z.number().int(),
  /** Present on snapshots created after version restore fix; omitted on legacy baselines. */
  relations: z.array(PmScheduleBaselineRelationSchema).optional(),
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