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
    kind: text('kind', { enum: ['local', 'network', 'local_files', 'shared', 'sync'] }).notNull().default('local'),
    embedConfigJson: text('embed_config_json').notNull().default('{}'),
    chunkConfigJson: text('chunk_config_json').notNull().default('{}'),
    watchConfigJson: text('watch_config_json').notNull().default('{}'),
    retrievalConfigJson: text('retrieval_config_json').notNull().default('{}'),
    activeIndexVersion: integer('active_index_version').notNull().default(1),
    visibility: text('visibility', { enum: ['private', 'workspace', 'shared'] })
      .notNull()
      .default('private'),
    ownerId: text('owner_id'),
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
    contentHash: text('content_hash'),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }),
    httpStatus: integer('http_status'),
    etag: text('etag'),
    lastModified: text('last_modified'),
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
    parsedHash: text('parsed_hash'),
    mimeType: text('mime_type'),
    status: text('status', {
      enum: [
        'queued',
        'parsing',
        'ocr',
        'chunking',
        'embedding',
        'indexing',
        'ready',
        'failed',
        'cancelled',
        'stale',
      ],
    })
      .notNull()
      .default('queued'),
    absolutePath: text('absolute_path'),
    blobHash: text('blob_hash').references(() => blobs.hash, { onDelete: 'set null' }),
    metadataJson: text('metadata_json').notNull().default('{}'),
    errorJson: text('error_json'),
    revisionNumber: integer('revision_number').notNull().default(1),
    currentRevisionId: text('current_revision_id'),
    indexVersion: integer('index_version').notNull().default(1),
    indexFingerprint: text('index_fingerprint'),
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
    revisionId: text('revision_id'),
    indexVersion: integer('index_version').notNull().default(1),
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
      enum: [
        'queued',
        'parsing',
        'ocr',
        'chunking',
        'embedding',
        'indexing',
        'done',
        'failed',
        'cancelled',
      ],
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

export const knowledgeIndexVersions = sqliteTable(
  'knowledge_index_versions',
  {
    id: text('id').primaryKey(),
    kbId: text('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    embeddingModel: text('embedding_model').notNull().default(''),
    embeddingDimension: integer('embedding_dimension').notNull().default(0),
    chunkStrategy: text('chunk_strategy').notNull().default('markdown'),
    chunkSize: integer('chunk_size').notNull().default(512),
    chunkOverlap: integer('chunk_overlap').notNull().default(64),
    reranker: text('reranker'),
    vectorBackend: text('vector_backend').notNull().default('file'),
    indexFingerprint: text('index_fingerprint'),
    status: text('status', {
      enum: ['building', 'ready', 'active', 'failed', 'retired'],
    })
      .notNull()
      .default('active'),
    errorJson: text('error_json'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    activatedAt: integer('activated_at', { mode: 'timestamp_ms' }),
    retiredAt: integer('retired_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    unique('knowledge_index_versions_kb_version_unique').on(t.kbId, t.version),
    index('knowledge_index_versions_kb_id_idx').on(t.kbId),
  ],
)

export const documentRevisions = sqliteTable(
  'document_revisions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    kbId: text('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    contentHash: text('content_hash'),
    parsedHash: text('parsed_hash'),
    indexFingerprint: text('index_fingerprint'),
    indexVersion: integer('index_version').notNull().default(1),
    isCurrent: integer('is_current').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('document_revisions_doc_number_unique').on(t.documentId, t.revisionNumber),
    index('document_revisions_document_id_idx').on(t.documentId),
    index('document_revisions_kb_id_idx').on(t.kbId),
  ],
)
