import { z } from 'zod'
import { TimestampSchema, UuidSchema } from '../ipc/base.js'
import { P2pEventTypeSchema, P2pResourceTypeSchema } from './types.js'

export const WorkspaceEventSchema = z.object({
  eventId: UuidSchema,
  workspaceId: UuidSchema,
  seq: z.number().int().positive(),
  resourceType: P2pResourceTypeSchema,
  resourceId: z.string().min(1),
  operatorId: z.string().min(1),
  eventType: P2pEventTypeSchema,
  payload: z.record(z.unknown()),
  timestamp: TimestampSchema,
  sourceDeviceId: z.string().min(1),
})

export type WorkspaceEvent = z.infer<typeof WorkspaceEventSchema>
