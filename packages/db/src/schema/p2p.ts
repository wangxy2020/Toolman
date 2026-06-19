import { sqliteTable, text, integer, index, unique, primaryKey, blob } from 'drizzle-orm/sqlite-core'
import { identities } from './identity.js'

export const p2pWorkspaces = sqliteTable(
  'p2p_workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ownerDeviceId: text('owner_device_id').notNull(),
    ownerIdentityId: text('owner_identity_id')
      .notNull()
      .references(() => identities.id),
    workspaceKeyHash: text('workspace_key_hash').notNull(),
    description: text('description'),
    avatarHash: text('avatar_hash'),
    maxMembers: integer('max_members').notNull().default(10),
    status: text('status', { enum: ['active', 'archived', 'dissolved'] })
      .notNull()
      .default('active'),
    settingsJson: text('settings_json').notNull().default('{}'),
    lastEventSeq: integer('last_event_seq').notNull().default(0),
    lastSnapshotSeq: integer('last_snapshot_seq').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('idx_p2p_workspaces_owner').on(t.ownerIdentityId),
    index('idx_p2p_workspaces_status').on(t.status),
  ],
)

export const p2pWorkspaceMembers = sqliteTable(
  'p2p_workspace_members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
    identityId: text('identity_id')
      .notNull()
      .references(() => identities.id),
    deviceId: text('device_id').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role', { enum: ['owner', 'admin', 'member', 'readonly'] }).notNull(),
    status: text('status', { enum: ['active', 'invited', 'left', 'removed'] })
      .notNull()
      .default('invited'),
    invitedBy: text('invited_by'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    certJson: text('cert_json'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('p2p_workspace_members_workspace_device_unique').on(t.workspaceId, t.deviceId),
    index('idx_p2p_members_workspace').on(t.workspaceId, t.status),
    index('idx_p2p_members_identity').on(t.identityId),
  ],
)

export const p2pEvents = sqliteTable(
  'p2p_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    resourceType: text('resource_type', {
      enum: ['Knowledge', 'Note', 'Agent', 'File', 'Member', 'Workspace'],
    }).notNull(),
    resourceId: text('resource_id').notNull(),
    operatorId: text('operator_id').notNull(),
    eventType: text('event_type', {
      enum: ['Created', 'Updated', 'Deleted', 'Shared', 'Joined', 'Left'],
    }).notNull(),
    payloadJson: text('payload_json').notNull(),
    payloadHash: text('payload_hash').notNull(),
    prevEventHash: text('prev_event_hash'),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
    sourceDeviceId: text('source_device_id').notNull(),
    synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('p2p_events_workspace_seq_unique').on(t.workspaceId, t.seq),
    index('idx_p2p_events_workspace_seq').on(t.workspaceId, t.seq),
    index('idx_p2p_events_resource').on(t.workspaceId, t.resourceType, t.resourceId),
    index('idx_p2p_events_timestamp').on(t.workspaceId, t.timestamp),
  ],
)

export const p2pSnapshots = sqliteTable(
  'p2p_snapshots',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
    snapshotSeq: integer('snapshot_seq').notNull(),
    stateJson: text('state_json').notNull(),
    stateCompressed: blob('state_compressed'),
    stateHash: text('state_hash').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('idx_p2p_snapshots_workspace_seq').on(t.workspaceId, t.snapshotSeq)],
)

export const p2pSharedResources = sqliteTable(
  'p2p_shared_resources',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type', {
      enum: ['Knowledge', 'Note', 'Agent', 'File', 'Workflow'],
    }).notNull(),
    localResourceId: text('local_resource_id'),
    name: text('name').notNull(),
    sharedBy: text('shared_by').notNull(),
    permission: text('permission', { enum: ['read', 'write', 'admin'] }).notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    contentHash: text('content_hash'),
    version: integer('version').notNull().default(1),
    status: text('status', { enum: ['active', 'unshared', 'deleted'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('idx_p2p_shared_ws_type').on(t.workspaceId, t.resourceType, t.status),
    index('idx_p2p_shared_local').on(t.localResourceId),
  ],
)

export const p2pPeerNodes = sqliteTable(
  'p2p_peer_nodes',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    displayName: text('display_name').notNull(),
    deviceName: text('device_name').notNull(),
    publicKey: text('public_key').notNull(),
    online: integer('online', { mode: 'boolean' }).notNull().default(false),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    connectionState: text('connection_state', {
      enum: ['idle', 'connecting', 'connected', 'reconnecting'],
    }),
    trusted: integer('trusted', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.deviceId] }),
  ],
)

export const p2pSyncCursors = sqliteTable(
  'p2p_sync_cursors',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
    peerDeviceId: text('peer_device_id').notNull(),
    lastSentSeq: integer('last_sent_seq').notNull().default(0),
    lastReceivedSeq: integer('last_received_seq').notNull().default(0),
    lastSyncAt: integer('last_sync_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [unique('p2p_sync_cursors_workspace_peer_unique').on(t.workspaceId, t.peerDeviceId)],
)

export const p2pFileVersions = sqliteTable(
  'p2p_file_versions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
    sharedResourceId: text('shared_resource_id')
      .notNull()
      .references(() => p2pSharedResources.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    contentHash: text('content_hash').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mimeType: text('mime_type'),
    uploadedBy: text('uploaded_by').notNull(),
    eventId: text('event_id').references(() => p2pEvents.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [unique('p2p_file_versions_resource_version_unique').on(t.sharedResourceId, t.version)],
)

export const p2pInvites = sqliteTable(
  'p2p_invites',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    role: text('role', { enum: ['admin', 'member', 'readonly'] }).notNull(),
    createdBy: text('created_by').notNull(),
    maxUses: integer('max_uses').notNull().default(1),
    useCount: integer('use_count').notNull().default(0),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
)

export const p2pDeviceIdentity = sqliteTable('p2p_device_identity', {
  deviceId: text('device_id').primaryKey(),
  identityId: text('identity_id')
    .notNull()
    .references(() => identities.id),
  publicKey: text('public_key').notNull(),
  privateKeyRef: text('private_key_ref').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
