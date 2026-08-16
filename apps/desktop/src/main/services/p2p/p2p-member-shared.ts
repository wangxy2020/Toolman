export {
  DEFAULT_IDENTITY_ID,
  getWorkspaceRepo,
  getMemberRepo,
  getPeerRepo,
  getInviteRepo,
  getIdentityDisplayName,
  ensureWorkspaceDir,
  mapWorkspaceRow,
  toWorkspaceDto,
  mapMemberRow,
  shouldInitiatePeerConnection,
  resolveSharedMembershipWorkspaceId,
} from './p2p-member-shared-repos'

// Prefer importing ensureOwnerMemberRecord from './p2p-member-shared-repos'
// directly to avoid Rollup circular chunk warnings with this facade.
export { ensureOwnerMemberRecord } from './p2p-member-shared-repos'

export {
  resolveStoredMemberDisplayName,
  touchMemberLastSeen,
  listWorkspaceMemberRoster,
  findIdentitySibling,
  membershipFromIdentitySibling,
  hasWorkspaceMemberCapacity,
} from './p2p-member-shared-membership'
