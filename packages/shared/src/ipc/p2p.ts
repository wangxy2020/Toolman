import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import { ContentBlockSchema } from './agent.js'
import { NoteIdSchema } from './notes.js'
import { AgentPackageSchema } from '../p2p/agent-package.js'
import { WorkspaceEventSchema } from '../p2p/events.js'
import {
  DiscoveredNodeSchema,
  P2pConnectionInfoSchema,
  P2pMemberSchema,
  P2pSharedResourceSchema,
  P2pSyncPeerStatusSchema,
  P2pWorkspaceSchema,
} from '../p2p/workspace.js'
import {
  P2pConnectionStateSchema,
  P2pInvitableMemberRoleSchema,
  P2pMemberRoleSchema,
  P2pAgentSessionPermissionSchema,
  P2pKnowledgeDocumentPermissionSchema,
  P2pSequencingModeSchema,
  P2pSharedResourceStatusSchema,
  P2pResourceTypeSchema,
  P2pSyncStatusSchema,
  P2pWorkspaceListFilterSchema,
} from '../p2p/types.js'

/** Shared resource row id (UUID for files/KB, `note-<uuid>` for notes, etc.) */
export const P2pSharedResourceIdSchema = z.string().min(1).max(200)

// --- Health ---

export const P2pPingOutputSchema = z.object({
  pong: z.literal(true),
  message: z.string(),
  nativeVersion: z.string(),
})

export type P2pPingOutput = z.infer<typeof P2pPingOutputSchema>

// --- Discovery ---

export const P2pDiscoveryStartOutputSchema = z.object({
  started: z.literal(true),
})

export const P2pDiscoveryListNodesInputSchema = z.object({
  onlineOnly: z.boolean().optional(),
})

export const P2pDiscoveryListNodesOutputSchema = z.object({
  nodes: z.array(DiscoveredNodeSchema),
})

// --- Device identity ---

export const P2pDeviceGetInfoOutputSchema = z.object({
  deviceId: UuidSchema,
  identityId: UuidSchema,
  publicKey: z.string().min(1),
  publicKeyFingerprint: z.string().min(1),
  privateKeyRef: z.string().min(1),
  createdAt: TimestampSchema,
})

export type P2pDeviceGetInfoOutput = z.infer<typeof P2pDeviceGetInfoOutputSchema>

export const P2pNetworkGetConfigOutputSchema = z.object({
  stunServers: z.array(z.string().min(1)),
})

export const P2pNetworkSetStunServersInputSchema = z.object({
  stunServers: z.array(z.string().min(1)),
})

export const P2pNetworkSetStunServersOutputSchema = z.object({
  stunServers: z.array(z.string().min(1)),
})

// --- Connection ---

export const P2pConnectionConnectInputSchema = z.object({
  peerDeviceId: z.string().min(1),
  workspaceId: UuidSchema.optional(),
})

export const P2pConnectionConnectOutputSchema = z.object({
  state: P2pConnectionStateSchema,
})

export const P2pConnectionDisconnectInputSchema = z.object({
  peerDeviceId: z.string().min(1),
})

export const P2pConnectionDisconnectOutputSchema = z.object({
  state: z.literal('closed'),
})

export const P2pConnectionListOutputSchema = z.object({
  connections: z.array(P2pConnectionInfoSchema),
})

// --- Workspace ---

export const P2pWorkspaceCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  maxMembers: z.number().int().min(1).max(10).optional(),
})

export const P2pWorkspaceCreateOutputSchema = z.object({
  workspace: P2pWorkspaceSchema,
  inviteToken: z.string().min(1),
})

export const P2pWorkspaceListInputSchema = z.object({
  filter: P2pWorkspaceListFilterSchema.optional(),
})

export const P2pWorkspaceListOutputSchema = z.object({
  workspaces: z.array(P2pWorkspaceSchema),
})

export const P2pWorkspaceGetInputSchema = z.object({
  id: UuidSchema,
})

export const P2pWorkspaceGetOutputSchema = z.object({
  workspace: P2pWorkspaceSchema,
})

export const P2pWorkspaceUpdateInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  settings: z.record(z.unknown()).optional(),
})

export const P2pWorkspaceUpdateOutputSchema = z.object({
  workspace: P2pWorkspaceSchema,
})

export const P2pWorkspaceDeleteInputSchema = z.object({
  id: UuidSchema,
})

export const P2pWorkspaceDeleteOutputSchema = z.object({
  deleted: z.literal(true),
})

export const P2pWorkspaceLeaveInputSchema = z.object({
  id: UuidSchema,
})

export const P2pWorkspaceLeaveOutputSchema = z.object({
  left: z.literal(true),
})

export const P2pWorkspaceGetStoragePathInputSchema = z.object({
  id: UuidSchema,
})

export const P2pWorkspaceGetStoragePathOutputSchema = z.object({
  storagePath: z.string().min(1),
})

// --- Member ---

export const P2pMemberListInputSchema = z.object({
  workspaceId: UuidSchema,
})

export const P2pMemberListOutputSchema = z.object({
  members: z.array(P2pMemberSchema),
})

export const P2pMemberInviteInputSchema = z.object({
  workspaceId: UuidSchema,
  role: P2pInvitableMemberRoleSchema,
  maxUses: z.number().int().positive().optional(),
  expiresInHours: z.number().int().positive().max(720).optional(),
})

export const P2pMemberInviteOutputSchema = z.object({
  inviteToken: z.string().min(1),
  inviteUrl: z.string().min(1),
  qrData: z.string().min(1),
  expiresAt: TimestampSchema,
})

export const P2pMemberJoinInputSchema = z.object({
  inviteToken: z.string().min(1),
  displayName: z.string().min(1).max(100).optional(),
})

export const P2pMemberJoinOutputSchema = z.object({
  workspace: P2pWorkspaceSchema,
  member: P2pMemberSchema,
})

export const P2pMemberRemoveInputSchema = z.object({
  workspaceId: UuidSchema,
  memberId: UuidSchema,
})

export const P2pMemberRemoveOutputSchema = z.object({
  removed: z.literal(true),
})

export const P2pMemberUpdateRoleInputSchema = z.object({
  workspaceId: UuidSchema,
  memberId: UuidSchema,
  role: P2pMemberRoleSchema,
})

export const P2pMemberUpdateRoleOutputSchema = z.object({
  member: P2pMemberSchema,
})

export const P2pMemberTrustDeviceInputSchema = z.object({
  workspaceId: UuidSchema,
  peerDeviceId: z.string().min(1),
  trusted: z.boolean(),
})

export const P2pMemberTrustDeviceOutputSchema = z.object({
  trusted: z.boolean(),
})

export const P2pPeerTrustRequiredPayloadSchema = z.object({
  workspaceId: UuidSchema,
  peerDeviceId: z.string().min(1),
  displayName: z.string().min(1),
  deviceName: z.string().min(1),
  publicKeyFingerprint: z.string().min(1),
})

export type P2pPeerTrustRequiredPayload = z.infer<typeof P2pPeerTrustRequiredPayloadSchema>

// --- Sync ---

export const P2pSyncWorkspaceInputSchema = z.object({
  workspaceId: UuidSchema,
})

export const P2pSyncStartOutputSchema = z.object({
  status: z.enum(['syncing', 'idle']),
  peersTotal: z.number().int().nonnegative(),
  peersConnected: z.number().int().nonnegative(),
})

export const P2pSyncStopOutputSchema = z.object({
  status: z.literal('idle'),
})

export const P2pSyncStatusOutputSchema = z.object({
  status: P2pSyncStatusSchema,
  lastEventSeq: z.number().int().nonnegative(),
  lastSyncAt: TimestampSchema.optional(),
  peers: z.array(P2pSyncPeerStatusSchema),
  pendingFiles: z.number().int().nonnegative(),
  error: z.string().optional(),
  sequencingMode: P2pSequencingModeSchema,
  ownerOnline: z.boolean(),
})

export const P2pSyncForceInputSchema = z.object({
  workspaceId: UuidSchema,
  peerDeviceId: z.string().min(1).optional(),
})

export const P2pSyncForceOutputSchema = z.object({
  eventsApplied: z.number().int().nonnegative(),
  filesFetched: z.number().int().nonnegative(),
  snapshotUsed: z.boolean(),
})

export const P2pSyncCatchUpInputSchema = z.object({
  workspaceId: UuidSchema,
})

export const P2pSyncCatchUpOutputSchema = z.object({
  caughtUp: z.boolean(),
})

// --- Resource ---

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

// --- Note ---

export const P2pNoteShareInputSchema = z.object({
  workspaceId: UuidSchema,
  noteId: NoteIdSchema,
  permission: z.enum(['read', 'write']).optional(),
})

export const P2pNoteShareOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pNotePushUpdateInputSchema = z.object({
  workspaceId: UuidSchema,
  noteId: NoteIdSchema,
  content: z.string(),
})

export const P2pNotePushUpdateOutputSchema = z.object({
  event: WorkspaceEventSchema,
})

export const P2pNoteSetPermissionInputSchema = z.object({
  workspaceId: UuidSchema,
  resourceId: P2pSharedResourceIdSchema,
  permission: z.enum(['read', 'write']),
})

export const P2pNoteSetPermissionOutputSchema = z.object({
  sharedResource: P2pSharedResourceSchema,
})

export const P2pNoteListShareTargetsInputSchema = z.object({
  noteId: NoteIdSchema,
})

export const P2pNoteListShareTargetsOutputSchema = z.object({
  workspaceIds: z.array(UuidSchema),
})

// --- Push event payloads (subscribe) ---

export const P2pDiscoveryNodeOfflinePayloadSchema = z.object({
  deviceId: z.string().min(1),
})

export const P2pConnectionStateChangePayloadSchema = z.object({
  peerDeviceId: z.string().min(1),
  state: P2pConnectionStateSchema,
  workspaceId: UuidSchema.optional(),
})

export const P2pConnectionErrorPayloadSchema = z.object({
  peerDeviceId: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
})

export const P2pSyncProgressPayloadSchema = z.object({
  workspaceId: UuidSchema,
  phase: z.string().min(1),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

export const P2pSyncCompletedPayloadSchema = z.object({
  workspaceId: UuidSchema,
  eventsApplied: z.number().int().nonnegative(),
  filesFetched: z.number().int().nonnegative(),
})

export const P2pSyncErrorPayloadSchema = z.object({
  workspaceId: UuidSchema,
  code: z.string().min(1),
  message: z.string().min(1),
})
