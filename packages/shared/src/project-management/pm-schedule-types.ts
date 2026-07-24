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
  /**
   * Task resource assignments at capture time (plan version / baseline).
   * Omitted on legacy snapshots — restore must not clear live assignments.
   */
  resourceAssignments: z.array(z.unknown()).optional(),
  /**
   * Task cost (price-list) assignments at capture time.
   * Omitted on legacy snapshots — restore must not clear live assignments.
   */
  costAssignments: z.array(z.unknown()).optional(),
})

export type PmScheduleBaselineItem = z.infer<typeof PmScheduleBaselineItemSchema>

/** True when this snapshot item recorded assignment fields (even if empty arrays). */
export function baselineItemHasAssignmentSnapshot(
  item: Pick<PmScheduleBaselineItem, 'resourceAssignments' | 'costAssignments'>,
): boolean {
  return item.resourceAssignments !== undefined || item.costAssignments !== undefined
}

/**
 * Pick resource/cost assignment arrays from live work-item metadata for capture.
 * Always returns both keys so restores can clear assignments when empty.
 */
export function pickAssignmentSnapshotFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): {
  resourceAssignments: unknown[]
  costAssignments: unknown[]
} {
  const resourceAssignments = Array.isArray(metadata?.resourceAssignments)
    ? [...(metadata!.resourceAssignments as unknown[])]
    : []
  const costAssignments = Array.isArray(metadata?.costAssignments)
    ? [...(metadata!.costAssignments as unknown[])]
    : []
  return { resourceAssignments, costAssignments }
}

/**
 * Merge snapshot assignment fields into live metadata (shallow-merge friendly).
 * Uses `null` for empty lists so shallow merge clears previous arrays.
 * Returns null when the snapshot item is legacy (no assignment fields).
 */
export function mergeAssignmentSnapshotIntoMetadata(
  metadata: Record<string, unknown> | null | undefined,
  item: Pick<PmScheduleBaselineItem, 'resourceAssignments' | 'costAssignments'>,
): Record<string, unknown> | null {
  if (!baselineItemHasAssignmentSnapshot(item)) return null
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...metadata }
      : {}
  const resourceAssignments = item.resourceAssignments ?? []
  const costAssignments = item.costAssignments ?? []
  base.resourceAssignments = resourceAssignments.length > 0 ? resourceAssignments : null
  base.costAssignments = costAssignments.length > 0 ? costAssignments : null
  // Force-clear legacy single-assignment key under shallow merge.
  base.resourceAssignment = null
  return base
}

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
  /** As-of / status date chosen when capturing the baseline (start of local day). */
  asOfDate: z.number().int().optional(),
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