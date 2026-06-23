import { z } from 'zod'

import { TimestampSchema, UuidSchema } from './base.js'

export const IdentityDeviceSummarySchema = z.object({
  deviceId: UuidSchema,
  identityId: UuidSchema,
  deviceName: z.string(),
  publicKeyFingerprint: z.string(),
  did: z.string().optional(),
})
export type IdentityDeviceSummary = z.infer<typeof IdentityDeviceSummarySchema>

export const IdentityProfileSchema = z.object({
  id: UuidSchema,
  type: z.enum(['local', 'linked']),
  displayName: z.string(),
  publicKey: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  device: IdentityDeviceSummarySchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type IdentityProfile = z.infer<typeof IdentityProfileSchema>

export const IdentityUpdateInputSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarSourcePath: z.string().min(1).optional(),
  clearAvatar: z.boolean().optional(),
})
export type IdentityUpdateInput = z.infer<typeof IdentityUpdateInputSchema>
