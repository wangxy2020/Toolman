import { z } from 'zod'
import { CommunityDeviceKindSchema } from '../ipc/community.js'

/** Capabilities a desktop host may advertise to mobile clients. */
export const AgentHostCapabilitySchema = z.enum([
  'agent',
  'classroom',
  'project-management',
  'knowledge-search',
])
export type AgentHostCapability = z.infer<typeof AgentHostCapabilitySchema>

export const AgentHostPresenceSchema = z.object({
  deviceId: z.string().min(1),
  identityId: z.string().min(1),
  deviceKind: CommunityDeviceKindSchema,
  agentHost: z.boolean(),
  capabilities: z.array(AgentHostCapabilitySchema).default([]),
  displayName: z.string().optional(),
  lastSeenAt: z.number().int().nonnegative(),
})
export type AgentHostPresence = z.infer<typeof AgentHostPresenceSchema>

export const AgentHostInvokeInputSchema = z.object({
  hostDeviceId: z.string().min(1),
  capability: AgentHostCapabilitySchema,
  /** Desktop-side assistant / session id when known. */
  targetId: z.string().optional(),
  message: z.string().min(1),
  stream: z.boolean().default(true),
})
export type AgentHostInvokeInput = z.infer<typeof AgentHostInvokeInputSchema>

export const AgentHostInvokeChunkSchema = z.object({
  type: z.enum(['delta', 'done', 'error']),
  text: z.string().optional(),
  error: z.string().optional(),
})
export type AgentHostInvokeChunk = z.infer<typeof AgentHostInvokeChunkSchema>
