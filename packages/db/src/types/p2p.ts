import type { InferSelectModel } from 'drizzle-orm'
import type {
  p2pEvents,
  p2pDeviceIdentity,
  p2pFileVersions,
  p2pInvites,
  p2pPeerNodes,
  p2pSharedResources,
  p2pSnapshots,
  p2pSyncCursors,
  p2pWorkspaceMembers,
  p2pWorkspaces,
} from '../schema/p2p.js'

export type P2pWorkspaceRow = InferSelectModel<typeof p2pWorkspaces>
export type P2pWorkspaceMemberRow = InferSelectModel<typeof p2pWorkspaceMembers>
export type P2pEventRow = InferSelectModel<typeof p2pEvents>
export type P2pDeviceIdentityRow = InferSelectModel<typeof p2pDeviceIdentity>
export type P2pInviteRow = InferSelectModel<typeof p2pInvites>
export type P2pPeerNodeRow = InferSelectModel<typeof p2pPeerNodes>
export type P2pSyncCursorRow = InferSelectModel<typeof p2pSyncCursors>
export type P2pSnapshotRow = InferSelectModel<typeof p2pSnapshots>
export type P2pSharedResourceRow = InferSelectModel<typeof p2pSharedResources>
export type P2pFileVersionRow = InferSelectModel<typeof p2pFileVersions>

export type P2pWorkspaceStatus = P2pWorkspaceRow['status']
export type P2pMemberRole = P2pWorkspaceMemberRow['role']
export type P2pMemberStatus = P2pWorkspaceMemberRow['status']
export type P2pInvitableMemberRole = P2pInviteRow['role']
export type P2pConnectionState = NonNullable<P2pPeerNodeRow['connectionState']>
export type P2pResourceType = P2pEventRow['resourceType']
export type P2pEventType = P2pEventRow['eventType']
