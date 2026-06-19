import { z } from 'zod'
import { MessageSchema } from '../ipc/agent.js'
import { MessageStreamEventSchema, ContentBlockSchema } from '../ipc/agent.js'
import { P2pAgentSessionPermissionSchema } from './types.js'
import { UuidSchema } from '../ipc/base.js'

export const P2pGroupAgentProxySchema = z.object({
  p2pWorkspaceId: UuidSchema,
  resourceId: z.string().min(1),
  sourceAssistantId: z.string().min(1),
  sourceSessionId: z.string().min(1),
  ownerMemberId: z.string().min(1),
  ownerDeviceId: z.string().min(1),
  permission: P2pAgentSessionPermissionSchema,
  groupName: z.string(),
  sharedAgentName: z.string(),
  referencedModelId: z.string().min(1),
})

export type P2pGroupAgentProxy = z.infer<typeof P2pGroupAgentProxySchema>

export const P2pGroupAgentAssistantProxySchema = z.object({
  p2pWorkspaceId: UuidSchema,
  resourceId: z.string().min(1),
  sourceAssistantId: z.string().min(1),
  groupName: z.string(),
  sharedAgentName: z.string(),
})

export type P2pGroupAgentAssistantProxy = z.infer<typeof P2pGroupAgentAssistantProxySchema>

export const AgentRelayFetchMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('fetch'),
  requestId: z.string().min(1),
  p2pWorkspaceId: UuidSchema,
  resourceId: z.string().min(1),
  sourceSessionId: z.string().min(1),
})

export const AgentRelayFetchOkMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('fetch_ok'),
  requestId: z.string().min(1),
  title: z.string(),
  messages: z.array(MessageSchema),
})

export const AgentRelayFetchErrMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('fetch_err'),
  requestId: z.string().min(1),
  message: z.string(),
})

export const AgentRelaySendMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('send'),
  requestId: z.string().min(1),
  p2pWorkspaceId: UuidSchema,
  resourceId: z.string().min(1),
  sourceSessionId: z.string().min(1),
  memberSessionId: UuidSchema,
  memberUserMessageId: UuidSchema,
  memberAssistantMessageId: UuidSchema,
  contentBlocks: z.array(ContentBlockSchema),
  modelIds: z.array(z.string().min(1)).optional(),
})

export const AgentRelaySendOkMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('send_ok'),
  requestId: z.string().min(1),
})

export const AgentRelaySendErrMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('send_err'),
  requestId: z.string().min(1),
  message: z.string(),
})

export const AgentRelayStreamMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal('stream'),
  requestId: z.string().min(1),
  event: MessageStreamEventSchema,
})

export const AgentRelayMessageSchema = z.discriminatedUnion('type', [
  AgentRelayFetchMessageSchema,
  AgentRelayFetchOkMessageSchema,
  AgentRelayFetchErrMessageSchema,
  AgentRelaySendMessageSchema,
  AgentRelaySendOkMessageSchema,
  AgentRelaySendErrMessageSchema,
  AgentRelayStreamMessageSchema,
])

export type AgentRelayMessage = z.infer<typeof AgentRelayMessageSchema>
