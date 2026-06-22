import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core'
import { workspaces } from './identity.js'
import { blobs } from './session.js'

export const knowledgeBases = sqliteTable(
  'knowledge_bases',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    kind: text('kind', { enum: ['local', 'network', 'local_files', 'shared'] }).notNull().default('local'),
    embedConfigJson: text('embed_config_json').notNull().default('{}'),
    chunkConfigJson: text('chunk_config_json').notNull().default('{}'),
    watchConfigJson: text('watch_config_json').notNull().default('{}'),
    status: text('status', { enum: ['idle', 'indexing', 'reindexing', 'error'] })
      .notNull()
      .default('idle'),
    documentCount: integer('document_count').notNull().default(0),
    chunkCount: integer('chunk_count').notNull().default(0),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('knowledge_bases_workspace_id_idx').on(t.workspaceId)],
)

export const documentSources = sqliteTable(
  'document_sources',
  {
    id: text('id').primaryKey(),
    kbId: text('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: ['folder', 'file', 'url', 'upload', 'notion_export'],
    }).notNull(),
    uri: text('uri').notNull(),
    configJson: text('config_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('document_sources_kb_id_idx').on(t.kbId)],
)

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').references(() => documentSources.id, { onDelete: 'set null' }),
    kbId: text('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    contentHash: text('content_hash'),
    mimeType: text('mime_type'),
    status: text('status', {
      enum: ['queued', 'parsing', 'chunking', 'embedding', 'indexing', 'ready', 'failed'],
    })
      .notNull()
      .default('queued'),
    absolutePath: text('absolute_path'),
    blobHash: text('blob_hash').references(() => blobs.hash, { onDelete: 'set null' }),
    metadataJson: text('metadata_json').notNull().default('{}'),
    errorJson: text('error_json'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('documents_kb_id_idx').on(t.kbId),
    index('documents_source_id_idx').on(t.sourceId),
    index('documents_content_hash_idx').on(t.contentHash),
  ],
)

export const chunks = sqliteTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    kbId: text('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    text: text('text').notNull(),
    tokenCount: integer('token_count'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('chunks_document_id_idx').on(t.documentId),
    index('chunks_kb_id_idx').on(t.kbId),
  ],
)

export const ingestJobs = sqliteTable(
  'ingest_jobs',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    kbId: text('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    stage: text('stage', {
      enum: ['queued', 'parsing', 'chunking', 'embedding', 'indexing', 'done', 'failed'],
    })
      .notNull()
      .default('queued'),
    progress: integer('progress').notNull().default(0),
    errorJson: text('error_json'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('ingest_jobs_document_id_idx').on(t.documentId),
    index('ingest_jobs_kb_id_idx').on(t.kbId),
  ],
)

export const memoryEntries = sqliteTable(
  'memory_entries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    assistantId: text('assistant_id'),
    sessionId: text('session_id'),
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(),
    source: text('source', { enum: ['conversation', 'manual', 'import'] })
      .notNull()
      .default('conversation'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('memory_entries_workspace_id_idx').on(t.workspaceId)],
)

export const fileRegistry = sqliteTable(
  'file_registry',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    absolutePath: text('absolute_path').notNull(),
    contentHash: text('content_hash').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mtimeMs: integer('mtime_ms').notNull(),
    documentId: text('document_id').references(() => documents.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('file_registry_workspace_path_unique').on(t.workspaceId, t.absolutePath),
    index('file_registry_workspace_id_idx').on(t.workspaceId),
    index('file_registry_content_hash_idx').on(t.contentHash),
  ],
)
