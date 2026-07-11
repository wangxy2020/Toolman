import { sqliteTable, text, integer, index, real } from 'drizzle-orm/sqlite-core'
import { workspaces } from './identity.js'

export const pmProjects = sqliteTable(
  'pm_projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: text('status', {
      enum: ['planning', 'active', 'on_hold', 'completed', 'archived'],
    })
      .notNull()
      .default('active'),
    domain: text('domain').notNull(),
    workspaceRoot: text('workspace_root'),
    description: text('description'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('pm_projects_workspace_domain_idx').on(t.workspaceId, t.domain),
    index('pm_projects_workspace_updated_idx').on(t.workspaceId, t.updatedAt),
  ],
)

export const pmWorkItems = sqliteTable(
  'pm_work_items',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => pmProjects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    type: text('type', {
      enum: ['task', 'milestone', 'phase', 'issue', 'wbs_node'],
    })
      .notNull()
      .default('task'),
    title: text('title').notNull(),
    status: text('status', {
      enum: ['todo', 'in_progress', 'done', 'blocked', 'cancelled'],
    })
      .notNull()
      .default('todo'),
    priority: text('priority', {
      enum: ['low', 'normal', 'high', 'urgent'],
    })
      .notNull()
      .default('normal'),
    domain: text('domain').notNull(),
    assignee: text('assignee'),
    description: text('description'),
    startDate: integer('start_date', { mode: 'timestamp_ms' }),
    dueDate: integer('due_date', { mode: 'timestamp_ms' }),
    progressPercent: integer('progress_percent').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    metadataJson: text('metadata_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('pm_work_items_project_sort_idx').on(t.projectId, t.sortOrder),
    index('pm_work_items_workspace_domain_idx').on(t.workspaceId, t.domain),
    index('pm_work_items_status_idx').on(t.status),
    index('pm_work_items_parent_idx').on(t.parentId),
  ],
)

export const pmWorkItemRelations = sqliteTable(
  'pm_work_item_relations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => pmProjects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    fromWorkItemId: text('from_work_item_id').notNull(),
    toWorkItemId: text('to_work_item_id').notNull(),
    type: text('type', { enum: ['FS', 'SS', 'FF', 'SF'] })
      .notNull()
      .default('FS'),
    lagDays: integer('lag_days').notNull().default(0),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('pm_relations_project_idx').on(t.projectId),
    index('pm_relations_from_idx').on(t.fromWorkItemId),
    index('pm_relations_to_idx').on(t.toWorkItemId),
  ],
)

export const pmScheduleBaselines = sqliteTable(
  'pm_schedule_baselines',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => pmProjects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    snapshotJson: text('snapshot_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('pm_baselines_project_idx').on(t.projectId, t.createdAt)],
)

export const pmTimeEntries = sqliteTable(
  'pm_time_entries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => pmProjects.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id'),
    assignee: text('assignee'),
    spentHours: real('spent_hours').notNull(),
    workDate: integer('work_date', { mode: 'timestamp_ms' }).notNull(),
    description: text('description'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('pm_time_entries_project_idx').on(t.projectId, t.workDate),
    index('pm_time_entries_workspace_idx').on(t.workspaceId, t.workDate),
  ],
)

export const pmDocumentLinks = sqliteTable(
  'pm_document_links',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id'),
    workItemId: text('work_item_id'),
    knowledgeBaseId: text('knowledge_base_id').notNull(),
    knowledgeDocumentId: text('knowledge_document_id').notNull(),
    linkType: text('link_type', { enum: ['reference', 'deliverable', 'archive'] })
      .notNull()
      .default('reference'),
    titleOverride: text('title_override'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('pm_document_links_project_idx').on(t.projectId),
    index('pm_document_links_workspace_idx').on(t.workspaceId),
    index('pm_document_links_doc_idx').on(t.knowledgeDocumentId),
  ],
)
