import { z } from 'zod'
import { UuidSchema } from './base.js'
import {
  PmScheduleBaselineSchema,
  PmWorkItemRelationSchema,
  PmWorkItemRelationTypeSchema,
} from '../project-management/pm-schedule-types.js'

export const PmRelationListInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema,
})

export const PmRelationListOutputSchema = z.object({
  relations: z.array(PmWorkItemRelationSchema),
})

export const PmRelationCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema,
  fromWorkItemId: UuidSchema,
  toWorkItemId: UuidSchema,
  type: PmWorkItemRelationTypeSchema.optional(),
  lagDays: z.number().int().optional(),
})

export const PmRelationDeleteInputSchema = z.object({
  id: UuidSchema,
})

export const PmBaselineListInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema,
})

export const PmBaselineListOutputSchema = z.object({
  baselines: z.array(PmScheduleBaselineSchema),
})

export const PmBaselineCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema,
  name: z.string().min(1).max(200).optional(),
  /** As-of date for the baseline (YYYY-MM-DD). Used for naming and progress-line compare. */
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export const PmBaselineUpdateInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(200).optional(),
  /** Update status / as-of date (YYYY-MM-DD). Refreshes live 应完成百分比. */
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /**
   * Patch actual progress on work items inside this baseline snapshot
   * (进度检查 edits while comparing a baseline).
   */
  workItemProgress: z
    .array(
      z.object({
        workItemId: UuidSchema,
        progressPercent: z.number().int().min(0).max(100),
      }),
    )
    .optional(),
})

export const PmBaselineGetInputSchema = z.object({
  id: UuidSchema,
})

export const PmBaselineDeleteInputSchema = z.object({
  id: UuidSchema,
  /** Soft-delete version plan snapshots (save-history cleanup / dedupe only). */
  allowVersionPlan: z.boolean().optional(),
})

export const PmBaselineRestoreInputSchema = z.object({
  id: UuidSchema,
})

export const PmBaselineRestoreOutputSchema = z.object({
  ok: z.literal(true),
  updatedCount: z.number().int().nonnegative(),
  /** Rows written that actually differed from the live plan before restore. */
  changedCount: z.number().int().nonnegative(),
  /** Rows written that already matched the snapshot (no visible change). */
  unchangedCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  /** Dependency links recreated from the snapshot (0 when snapshot has no relations). */
  relationsRestored: z.number().int().nonnegative().default(0),
  baselineId: UuidSchema,
  baselineName: z.string(),
  scheduleVersion: z.number().int().nonnegative().nullable(),
})

export type PmRelationListInput = z.infer<typeof PmRelationListInputSchema>
export type PmRelationCreateInput = z.infer<typeof PmRelationCreateInputSchema>
export type PmBaselineListInput = z.infer<typeof PmBaselineListInputSchema>
export type PmBaselineCreateInput = z.infer<typeof PmBaselineCreateInputSchema>
export type PmBaselineUpdateInput = z.infer<typeof PmBaselineUpdateInputSchema>
export type PmBaselineRestoreInput = z.infer<typeof PmBaselineRestoreInputSchema>
export type PmBaselineRestoreOutput = z.infer<typeof PmBaselineRestoreOutputSchema>
