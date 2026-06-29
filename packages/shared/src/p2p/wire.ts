import { z } from 'zod'
import { TimestampSchema, UuidSchema } from '../ipc/base.js'
import { P2pEventTypeSchema, P2pResourceTypeSchema } from './types.js'

/** Wire-format workspace event received over P2P replication. */
export const RemoteWorkspaceEventWireSchema = z.object({
  eventId: UuidSchema,
  workspaceId: UuidSchema,
  seq: z.number().int().positive(),
  resourceType: P2pResourceTypeSchema,
  resourceId: z.string().min(1),
  operatorId: z.string().min(1),
  eventType: P2pEventTypeSchema,
  payloadJson: z.string(),
  payloadHash: z.string().optional(),
  prevEventHash: z.string().nullable().optional(),
  timestamp: TimestampSchema,
  sourceDeviceId: z.string().min(1),
})

export type RemoteWorkspaceEventWire = z.infer<typeof RemoteWorkspaceEventWireSchema>

export const P2pEventPayloadSchema = z.record(z.unknown())

export const P2pMemberChangedPushSchema = z.object({
  workspaceId: UuidSchema.optional(),
  activated: z.boolean().optional(),
})

export const P2pWorkspaceDissolvedPushSchema = z.object({
  workspaceId: UuidSchema,
})

export const P2pEventAppendedPushSchema = z.object({
  workspaceId: UuidSchema.optional(),
  resourceType: P2pResourceTypeSchema.optional(),
  eventType: P2pEventTypeSchema.optional(),
})
