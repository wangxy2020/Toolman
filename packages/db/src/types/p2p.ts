import type { InferSelectModel } from 'drizzle-orm'
import type {
  p2pCidIndex,
  p2pEvents,
  p2pDeviceIdentity,
  p2pFileVersions,
  p2pInvites,
  p2pPeerNodes,
  p2pSharedResources,
  p2pSnapshots,
  p2pSyncCursors,
  p2pWorkspaces,
} from '../schema/p2p.js'

export type P2pWorkspaceRow = InferSelectModel<typeof p2pWorkspaces>
/**
 * Explicit row shape — `InferSelectModel` on the emitted `p2pWorkspaceMembers`
 * `.d.ts` collapses to `{ [x: string]: any }` for desktop consumers.
 */
export type P2pMemberRole = 'owner' | 'admin' | 'member' | 'readonly'
export type P2pMemberStatus = 'active' | 'invited' | 'left' | 'removed'
export interface P2pWorkspaceMemberRow {
  id: string
  workspaceId: string
  identityId: string
  deviceId: string
  displayName: string
  role: P2pMemberRole
  status: P2pMemberStatus
  invitedBy: string | null
  joinedAt: Date | null
  lastSeenAt: Date | null
  certJson: string | null
  createdAt: Date
  updatedAt: Date
}
export type P2pEventRow = InferSelectModel<typeof p2pEvents>
export type P2pDeviceIdentityRow = InferSelectModel<typeof p2pDeviceIdentity>
export type P2pInviteRow = InferSelectModel<typeof p2pInvites>
export type P2pPeerNodeRow = InferSelectModel<typeof p2pPeerNodes>
export type P2pSyncCursorRow = InferSelectModel<typeof p2pSyncCursors>
export type P2pSnapshotRow = InferSelectModel<typeof p2pSnapshots>
export type P2pSharedResourceRow = InferSelectModel<typeof p2pSharedResources>
export type P2pFileVersionRow = InferSelectModel<typeof p2pFileVersions>
export type P2pCidIndexRow = InferSelectModel<typeof p2pCidIndex>

export type P2pWorkspaceStatus = P2pWorkspaceRow['status']
export type P2pInvitableMemberRole = P2pInviteRow['role']
export type P2pConnectionState = NonNullable<P2pPeerNodeRow['connectionState']>
export type P2pResourceType = P2pEventRow['resourceType']
export type P2pEventType = P2pEventRow['eventType']
