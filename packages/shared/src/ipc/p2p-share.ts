import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { ContentBlockSchema } from './agent-session.js'
import { AgentPackageSchema } from '../p2p/agent-package.js'
import { WorkspaceEventSchema } from '../p2p/events.js'
import { P2pSharedResourceSchema } from '../p2p/workspace.js'
import {
  P2pAgentSessionPermissionSchema,
  P2pKnowledgeDocumentPermissionSchema,
  P2pResourceTypeSchema,
  P2pSharedResourceStatusSchema,
} from '../p2p/types.js'
import { P2pSharedResourceIdSchema } from './p2p-network.js'

export const P2pResourceUnshareInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
})

export const P2pResourceUnshareOutputSchema = z.object({
  unshared: z.literal(true),
})

export const P2pResourceListInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceType: P2pResourceTypeSchema.optional(),
  status: P2pSharedResourceStatusSchema.optional(),
})

export const P2pResourceListOutputSchema = z.object({
  resources: z.array(P2pSharedResourceSchema),
})

// --- Event ---

export const P2pEventListInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceType: P2pResourceTypeSchema.optional(),
  resourceId: z.string().min(1).optional(),
  sinceSeq: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
})

export const P2pEventListOutputSchema = z.object({
  events: z.array(WorkspaceEventSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})

export const P2pEventGetInputSchema = z.object({
  eventId: UuidSchema,
})

export const P2pEventGetOutputSchema = z.object({
  event: WorkspaceEventSchema,
})

// --- Agent ---

export const P2pAgentExportPackageInputSchema = z.object({
  assistantId: UuidSchema,
})

export const P2pAgentExportPackageOutputSchema = z.object({
  package: AgentPackageSchema,
  packageJson: z.string().min(1),
})

export const P2pAgentImportPackageInputSchema = z.object({
  workspaceId: UuidSchema,
  packageJson: z.string().min(1),
  share: z.boolean().optional(),
})

export const P2pAgentImportPackageOutputSchema = z.object({
  assistantId: UuidSchema,
  sharedResource: P2pSharedResourceSchema.optional(),
})

export const P2pAgentShareInputSchema = z.object({
  workspaceId: UuidSchema,
  assistantId: UuidSchema,
  sourceWorkspaceId: UuidSchema.optional(),
  permission: z.enum(['read', 'write']).optional(),
  sessionIds: z.array(z.string().min(1)).optional(),
})

export const P2pAgentShareOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pAgentRemoveSessionsInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
  sessionIds: z.array(z.string().min(1)).min(1),
})

export const P2pAgentRemoveSessionsOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema.nullable(),
})

export const P2pAgentSetSessionPermissionInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
  sessionId: z.string().min(1),
  permission: P2pAgentSessionPermissionSchema,
})

export const P2pAgentSetSessionPermissionOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pAgentOpenSessionInputSchema = z.object({
  p2pWorkspaceId: UuidSchema,
  resourceId: z.string().min(1),
  sourceSessionId: z.string().min(1),
  sessionTitle: z.string().min(1),
  groupName: z.string(),
  sharedAgentName: z.string(),
  permission: P2pAgentSessionPermissionSchema,
  ownerMemberId: z.string().min(1),
  sourceAssistantId: z.string().min(1),
  referencedModelId: z.string().min(1),
})

export const P2pAgentOpenSessionOutputSchema = z.object({
  sessionId: UuidSchema,
  assistantId: UuidSchema,
})

export const P2pGroupChatMessageSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  senderMemberId: z.string().min(1),
  senderName: z.string().min(1),
  contentBlocks: z.array(ContentBlockSchema),
  createdAt: TimestampSchema,
})

export type P2pGroupChatMessage = z.infer<typeof P2pGroupChatMessageSchema>

export const P2pGroupChatListInputSchema = z.object({
  workspaceId: UuidSchema,
  limit: z.number().int().min(1).max(500).optional(),
})

export const P2pGroupChatListOutputSchema = z.object({
  items: z.array(P2pGroupChatMessageSchema),
  selfMemberId: z.string().min(1).optional(),
})

export const P2pGroupChatSendInputSchema = z.object({
  workspaceId: UuidSchema,
  contentBlocks: z.array(ContentBlockSchema),
})

export const P2pGroupChatSendOutputSchema = z.object({
  message: P2pGroupChatMessageSchema,
})

export const P2pGroupChatDeleteInputSchema = z.object({
  workspaceId: UuidSchema,
  messageId: UuidSchema,
})

export const P2pGroupChatDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})

export const P2pGroupChatClearInputSchema = z.object({
  workspaceId: UuidSchema,
})

export const P2pGroupChatClearOutputSchema = z.object({
  cleared: z.boolean(),
})

// --- Knowledge ---

export const P2pKnowledgeShareInputSchema = z.object({
  workspaceId: UuidSchema,
  knowledgeBaseId: UuidSchema,
  sourceWorkspaceId: UuidSchema.optional(),
  permission: z.enum(['read', 'write']).optional(),
  documentIds: z.array(z.string().min(1)).optional(),
})

export const P2pKnowledgeShareOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pKnowledgeSyncDocumentInputSchema = z.object({
  workspaceId: UuidSchema,
  knowledgeBaseId: UuidSchema,
  documentId: UuidSchema,
})

export const P2pKnowledgeSyncDocumentOutputSchema = z.object({
  event: WorkspaceEventSchema,
})

export const P2pKnowledgeRemoveDocumentsInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
  documentIds: z.array(z.string().min(1)).min(1),
})

export const P2pKnowledgeRemoveDocumentsOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema.nullable(),
})

export const P2pKnowledgeSetDocumentPermissionInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
  documentId: z.string().min(1),
  permission: P2pKnowledgeDocumentPermissionSchema,
})

export const P2pKnowledgeSetDocumentPermissionOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pKnowledgeEnsureDocumentSavedInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
  documentId: z.string().min(1),
})

export const P2pKnowledgeEnsureDocumentSavedOutputSchema = z.object({
  absolutePath: z.string().min(1),
  savedDocumentId: z.string().min(1),
})

export const P2pKnowledgeMaterializeDocumentInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
  documentId: z.string().min(1),
})

export const P2pKnowledgeMaterializeDocumentOutputSchema = z.object({
  absolutePath: z.string().min(1),
})
