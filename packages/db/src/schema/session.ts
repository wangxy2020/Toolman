import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { workspaces } from './identity.js'
import { assistants } from './agent.js'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  assistantId: text('assistant_id').references(() => assistants.id, { onDelete: 'set null' }),
  modelId: text('model_id'),
  title: text('title').notNull().default('新对话'),
  type: text('type', { enum: ['chat', 'meeting', 'multi_model'] }).notNull().default('chat'),
  parentSessionId: text('parent_session_id'),
  forkMessageId: text('fork_message_id'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  messageCount: integer('message_count').notNull().default(0),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  parentMessageId: text('parent_message_id'),
  role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
  modelId: text('model_id'),
  content: text('content').notNull().default(''),
  status: text('status', {
    enum: ['pending', 'streaming', 'completed', 'aborted', 'failed'],
  })
    .notNull()
    .default('completed'),
  contentBlocksJson: text('content_blocks_json').notNull().default('[]'),
  toolCallsJson: text('tool_calls_json'),
  toolCallId: text('tool_call_id'),
  errorJson: text('error_json'),
  tokenUsageJson: text('token_usage_json'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const blobs = sqliteTable('blobs', {
  hash: text('hash').primaryKey(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  originalName: text('original_name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const messageAttachments = sqliteTable('message_attachments', {
  id: text('id').primaryKey(),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  blobHash: text('blob_hash')
    .notNull()
    .references(() => blobs.hash),
  name: text('name'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const sessionWindows = sqliteTable('session_windows', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  windowId: text('window_id').notNull().unique(),
  route: text('route').notNull().default('/chat'),
  boundsJson: text('bounds_json').notNull().default('{}'),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  isFocused: integer('is_focused', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/**
 * @deprecated Legacy device-level sync draft with no runtime consumers.
 * P2P workspace events use `p2p_events` instead. Table retained for schema compatibility.
 */
export const syncEvents = sqliteTable('sync_events', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  op: text('op', { enum: ['create', 'update', 'delete'] }).notNull(),
  payloadJson: text('payload_json').notNull(),
  vectorClock: text('vector_clock').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
