import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import {
  P2pMemberSchema,
  P2pSyncPeerStatusSchema,
  P2pWorkspaceSchema,
} from '../p2p/workspace.js'
import {
  P2pInvitableMemberRoleSchema,
  P2pMemberRoleSchema,
  P2pReplicationTopologySchema,
  P2pSequencingModeSchema,
  P2pSyncStatusSchema,
} from '../p2p/types.js'

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

export const P2pMemberListPendingTrustPromptsOutputSchema = z.object({
  prompts: z.array(P2pPeerTrustRequiredPayloadSchema),
})

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
  replicationTopology: P2pReplicationTopologySchema,
  meshPeersConnected: z.number().int().nonnegative(),
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
  force: z.boolean().optional(),
})

export const P2pSyncCatchUpOutputSchema = z.object({
  caughtUp: z.boolean(),
})

// --- Resource ---
