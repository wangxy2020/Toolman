import { z } from 'zod'
import { ContentBlockSchema } from '../ipc/agent.js'
import { TimestampSchema, UuidSchema } from '../ipc/base.js'
import { P2pEventTypeSchema } from './types.js'
import { WorkspaceEventSchema } from './events.js'

/** WAL business discriminant — aligned with WebRTC gossip wire types. */
export const P2pGroupChatWalKindSchema = z.enum([
  'group.chat.message',
  'group.chat.delete',
  'group.chat.clear',
])
export type P2pGroupChatWalKind = z.infer<typeof P2pGroupChatWalKindSchema>

/** Message body — field-compatible with IPC `P2pGroupChatMessageSchema`. */
export const P2pGroupChatMessageBodySchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  senderMemberId: z.string().min(1),
  senderName: z.string().min(1),
  contentBlocks: z.array(ContentBlockSchema).min(1),
  createdAt: TimestampSchema,
})
export type P2pGroupChatMessageBody = z.infer<typeof P2pGroupChatMessageBodySchema>

export const P2pGroupChatWalPayloadVSchema = z.literal(1)

export const P2pGroupChatMessagePayloadSchema = z.object({
  v: P2pGroupChatWalPayloadVSchema,
  kind: z.literal('group.chat.message'),
  message: P2pGroupChatMessageBodySchema,
})
export type P2pGroupChatMessagePayload = z.infer<typeof P2pGroupChatMessagePayloadSchema>

export const P2pGroupChatDeletePayloadSchema = z.object({
  v: P2pGroupChatWalPayloadVSchema,
  kind: z.literal('group.chat.delete'),
  workspaceId: UuidSchema,
  messageId: UuidSchema,
  deletedAt: TimestampSchema,
  deletedByMemberId: z.string().min(1),
})
export type P2pGroupChatDeletePayload = z.infer<typeof P2pGroupChatDeletePayloadSchema>

export const P2pGroupChatClearPayloadSchema = z.object({
  v: P2pGroupChatWalPayloadVSchema,
  kind: z.literal('group.chat.clear'),
  workspaceId: UuidSchema,
  clearedAt: TimestampSchema,
  clearedByMemberId: z.string().min(1),
})
export type P2pGroupChatClearPayload = z.infer<typeof P2pGroupChatClearPayloadSchema>

export const P2pGroupChatWalPayloadSchema = z.discriminatedUnion('kind', [
  P2pGroupChatMessagePayloadSchema,
  P2pGroupChatDeletePayloadSchema,
  P2pGroupChatClearPayloadSchema,
])
export type P2pGroupChatWalPayload = z.infer<typeof P2pGroupChatWalPayloadSchema>

export const P2P_GROUP_CHAT_RESOURCE_TYPE = 'GroupChat' as const

export interface GroupChatWalEnvelope {
  resourceType: typeof P2P_GROUP_CHAT_RESOURCE_TYPE
  resourceId: string
  eventType: z.infer<typeof P2pEventTypeSchema>
  payload: P2pGroupChatWalPayload
}

export function mapGroupChatWalToEnvelope(
  payload: P2pGroupChatWalPayload,
): GroupChatWalEnvelope {
  switch (payload.kind) {
    case 'group.chat.message':
      return {
        resourceType: P2P_GROUP_CHAT_RESOURCE_TYPE,
        resourceId: payload.message.id,
        eventType: 'Created',
        payload,
      }
    case 'group.chat.delete':
      return {
        resourceType: P2P_GROUP_CHAT_RESOURCE_TYPE,
        resourceId: payload.messageId,
        eventType: 'Deleted',
        payload,
      }
    case 'group.chat.clear':
      return {
        resourceType: P2P_GROUP_CHAT_RESOURCE_TYPE,
        resourceId: payload.workspaceId,
        eventType: 'Deleted',
        payload,
      }
  }
}

export function parseP2pGroupChatWalPayload(raw: unknown): P2pGroupChatWalPayload {
  return P2pGroupChatWalPayloadSchema.parse(raw)
}

export function isGroupChatWorkspaceEvent(
  event: z.infer<typeof WorkspaceEventSchema>,
): event is z.infer<typeof WorkspaceEventSchema> & {
  resourceType: typeof P2P_GROUP_CHAT_RESOURCE_TYPE
  payload: P2pGroupChatWalPayload
} {
  return (
    event.resourceType === P2P_GROUP_CHAT_RESOURCE_TYPE &&
    P2pGroupChatWalPayloadSchema.safeParse(event.payload).success
  )
}
