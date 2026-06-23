import { z } from 'zod'
import { TimestampSchema, UuidSchema } from '../ipc/base.js'
import {
  P2pConnectionModeSchema,
  P2pConnectionStateSchema,
  P2pMemberRoleSchema,
  P2pMemberStatusSchema,
  P2pSharedResourcePermissionSchema,
  P2pAgentSessionPermissionSchema,
  P2pKnowledgeDocumentPermissionSchema,
  P2pSharedResourceStatusSchema,
  P2pShareableResourceTypeSchema,
  P2pWorkspaceStatusSchema,
} from './types.js'

export const P2pWorkspaceSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  description: z.string().nullable().optional(),
  ownerDeviceId: z.string().min(1),
  ownerIdentityId: UuidSchema,
  maxMembers: z.number().int().min(1).max(10),
  status: P2pWorkspaceStatusSchema,
  memberCount: z.number().int().nonnegative(),
  lastEventSeq: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type P2pWorkspace = z.infer<typeof P2pWorkspaceSchema>

export const P2pMemberSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  identityId: UuidSchema,
  deviceId: z.string().min(1),
  displayName: z.string().min(1),
  role: P2pMemberRoleSchema,
  status: P2pMemberStatusSchema,
  online: z.boolean(),
  connectionMode: P2pConnectionModeSchema.optional(),
  lastSeenAt: TimestampSchema.optional(),
  joinedAt: TimestampSchema.optional(),
})

export type P2pMember = z.infer<typeof P2pMemberSchema>

export const P2pSharedResourceSchema = z.object({
  id: z.string().min(1),
  workspaceId: UuidSchema,
  resourceType: P2pShareableResourceTypeSchema,
  localResourceId: z.string().nullable().optional(),
  name: z.string().min(1),
  sharedBy: z.string().min(1),
  permission: P2pSharedResourcePermissionSchema,
  contentHash: z.string().nullable().optional(),
  version: z.number().int().positive(),
  status: P2pSharedResourceStatusSchema,
  sharedDocumentIds: z.array(z.string().min(1)).optional(),
  sharedSessionIds: z.array(z.string().min(1)).optional(),
  sharedSessionTitles: z.record(z.string().min(1), z.string()).optional(),
  sharedSessionPermissions: z.record(z.string().min(1), P2pAgentSessionPermissionSchema).optional(),
  sharedDocumentPermissions: z
    .record(z.string().min(1), P2pKnowledgeDocumentPermissionSchema)
    .optional(),
  sharedModelId: z.string().min(1).optional(),
  sourceWorkspaceId: UuidSchema.optional(),
  notebookId: z.string().min(1).optional(),
  notebookName: z.string().min(1).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type P2pSharedResource = z.infer<typeof P2pSharedResourceSchema>

export const DiscoveredNodeWorkspaceSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
})

export const DiscoveredNodeSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  userName: z.string().min(1),
  publicKeyFingerprint: z.string().min(1),
  online: z.boolean(),
  lastSeenAt: TimestampSchema,
  workspaces: z.array(DiscoveredNodeWorkspaceSchema).optional(),
})

export type DiscoveredNode = z.infer<typeof DiscoveredNodeSchema>

export const P2pConnectionInfoSchema = z.object({
  peerDeviceId: z.string().min(1),
  state: P2pConnectionStateSchema,
  workspaceId: UuidSchema.optional(),
  connectedAt: TimestampSchema.optional(),
  bytesSent: z.number().int().nonnegative(),
  bytesReceived: z.number().int().nonnegative(),
  connectionMode: P2pConnectionModeSchema.optional(),
})

export type P2pConnectionInfo = z.infer<typeof P2pConnectionInfoSchema>

export const P2pDiscoveredWorkspaceSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  ownerName: z.string(),
  memberCount: z.number().int().nonnegative(),
  peerDeviceId: z.string().min(1),
})

export type P2pDiscoveredWorkspace = z.infer<typeof P2pDiscoveredWorkspaceSchema>

export const P2pSyncPeerStatusSchema = z.object({
  deviceId: z.string().min(1),
  state: P2pConnectionStateSchema,
  lastSentSeq: z.number().int().nonnegative(),
  lastReceivedSeq: z.number().int().nonnegative(),
  pendingEvents: z.number().int().nonnegative(),
})

export type P2pSyncPeerStatus = z.infer<typeof P2pSyncPeerStatusSchema>
