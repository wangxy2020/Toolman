import { z } from 'zod'

/** Entities synchronized between desktop and mobile (Phase 2+). */
export const SyncEntityKindSchema = z.enum([
  'assistant',
  'session',
  'message',
  'note',
  'classroom_session',
  'project_summary',
  'translate_job',
  /** Knowledge-base folder metadata in the changelog. Files/chunks/vectors use the snapshot export. */
  'knowledge_meta',
])
export type SyncEntityKind = z.infer<typeof SyncEntityKindSchema>

export const SyncChangeOpSchema = z.enum(['upsert', 'delete'])
export type SyncChangeOp = z.infer<typeof SyncChangeOpSchema>

export const SyncChangeSchema = z.object({
  entityKind: SyncEntityKindSchema,
  entityId: z.string().min(1),
  op: SyncChangeOpSchema,
  /** Milliseconds since epoch; last-write-wins per entityId. */
  updatedAt: z.number().int().nonnegative(),
  payload: z.record(z.unknown()).optional(),
})
export type SyncChange = z.infer<typeof SyncChangeSchema>

export const SyncPushInputSchema = z.object({
  deviceId: z.string().min(1),
  cursor: z.string().nullable(),
  changes: z.array(SyncChangeSchema).max(500),
})
export type SyncPushInput = z.infer<typeof SyncPushInputSchema>

export const SyncPushOutputSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.array(z.object({ entityId: z.string(), reason: z.string() })).default([]),
  serverTime: z.number().int().nonnegative(),
})
export type SyncPushOutput = z.infer<typeof SyncPushOutputSchema>

export const SyncPullInputSchema = z.object({
  deviceId: z.string().min(1),
  cursor: z.string().nullable(),
  limit: z.number().int().positive().max(500).default(100),
})
export type SyncPullInput = z.infer<typeof SyncPullInputSchema>

export const SyncPullOutputSchema = z.object({
  changes: z.array(SyncChangeSchema),
  nextCursor: z.string().nullable(),
  serverTime: z.number().int().nonnegative(),
  /** True when more changelog rows exist after `nextCursor`. */
  hasMore: z.boolean().optional(),
})
export type SyncPullOutput = z.infer<typeof SyncPullOutputSchema>
