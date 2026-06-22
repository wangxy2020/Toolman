import { z } from 'zod'

export const P2pMemberRoleSchema = z.enum(['owner', 'admin', 'member', 'readonly'])
export type P2pMemberRole = z.infer<typeof P2pMemberRoleSchema>

export const P2pInvitableMemberRoleSchema = z.enum(['admin', 'member', 'readonly'])
export type P2pInvitableMemberRole = z.infer<typeof P2pInvitableMemberRoleSchema>

export const P2pMemberStatusSchema = z.enum(['active', 'invited', 'left', 'removed'])
export type P2pMemberStatus = z.infer<typeof P2pMemberStatusSchema>

export const P2pWorkspaceStatusSchema = z.enum(['active', 'archived', 'dissolved'])
export type P2pWorkspaceStatus = z.infer<typeof P2pWorkspaceStatusSchema>

export const P2pResourceTypeSchema = z.enum([
  'Knowledge',
  'Note',
  'Agent',
  'File',
  'Workflow',
  'Member',
  'Workspace',
])
export type P2pResourceType = z.infer<typeof P2pResourceTypeSchema>

export const P2pShareableResourceTypeSchema = z.enum([
  'Knowledge',
  'Note',
  'Agent',
  'File',
  'Workflow',
])
export type P2pShareableResourceType = z.infer<typeof P2pShareableResourceTypeSchema>

export const P2pEventTypeSchema = z.enum([
  'Created',
  'Updated',
  'Deleted',
  'Shared',
  'Joined',
  'Left',
])
export type P2pEventType = z.infer<typeof P2pEventTypeSchema>

export const P2pConnectionModeSchema = z.enum(['lan', 'wan'])
export type P2pConnectionMode = z.infer<typeof P2pConnectionModeSchema>

export const P2pConnectionStateSchema = z.enum([
  'idle',
  'signaling',
  'connecting',
  'connected',
  'reconnecting',
  'closed',
])
export type P2pConnectionState = z.infer<typeof P2pConnectionStateSchema>

export const P2pSharedResourcePermissionSchema = z.enum(['read', 'write', 'admin'])
export type P2pSharedResourcePermission = z.infer<typeof P2pSharedResourcePermissionSchema>

export const P2pAgentSessionPermissionSchema = z.enum(['read', 'callable'])
export type P2pAgentSessionPermission = z.infer<typeof P2pAgentSessionPermissionSchema>

export const P2pKnowledgeDocumentPermissionSchema = z.enum(['read', 'savable'])
export type P2pKnowledgeDocumentPermission = z.infer<typeof P2pKnowledgeDocumentPermissionSchema>

export const P2pSharedResourceStatusSchema = z.enum(['active', 'unshared', 'deleted'])
export type P2pSharedResourceStatus = z.infer<typeof P2pSharedResourceStatusSchema>

export const P2pSyncStatusSchema = z.enum(['idle', 'syncing', 'error'])
export type P2pSyncStatus = z.infer<typeof P2pSyncStatusSchema>

export const P2pSequencingModeSchema = z.enum(['owner_authoritative', 'lamport_degraded'])
export type P2pSequencingMode = z.infer<typeof P2pSequencingModeSchema>

export const P2pWorkspaceListFilterSchema = z.enum(['mine', 'joined', 'all'])
export type P2pWorkspaceListFilter = z.infer<typeof P2pWorkspaceListFilterSchema>

export const P2pFileListSortBySchema = z.enum(['name', 'updated_at', 'size'])
export type P2pFileListSortBy = z.infer<typeof P2pFileListSortBySchema>

export const P2pSortOrderSchema = z.enum(['asc', 'desc'])
export type P2pSortOrder = z.infer<typeof P2pSortOrderSchema>
