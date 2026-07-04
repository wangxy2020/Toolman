import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { workspaces } from './identity.js'
import { assistants } from './agent.js'
import { sessions } from './session.js'

export const agentTasks = sqliteTable(
  'agent_tasks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    assistantId: text('assistant_id').references(() => assistants.id, { onDelete: 'set null' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    goal: text('goal'),
    status: text('status', {
      enum: [
        'pending',
        'planning',
        'executing',
        'reflecting',
        'retrying',
        'paused',
        'completed',
        'failed',
        'cancelled',
      ],
    })
      .notNull()
      .default('pending'),
    currentStepId: text('current_step_id'),
    retryCount: integer('retry_count').notNull().default(0),
    plannerModelId: text('planner_model_id'),
    executorModelId: text('executor_model_id'),
    workspaceRoot: text('workspace_root'),
    historyJson: text('history_json').notNull().default('[]'),
    budgetJson: text('budget_json').notNull().default('{}'),
    notes: text('notes'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('agent_tasks_workspace_updated_idx').on(t.workspaceId, t.updatedAt),
    index('agent_tasks_assistant_updated_idx').on(t.assistantId, t.updatedAt),
    index('agent_tasks_session_idx').on(t.sessionId),
    index('agent_tasks_status_idx').on(t.status),
  ],
)

/** MVP: single global worker lock (id = 'global'). */
export const agentTaskLock = sqliteTable('agent_task_lock', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => agentTasks.id, { onDelete: 'cascade' }),
  workerId: text('worker_id').notNull(),
  acquiredAt: integer('acquired_at', { mode: 'timestamp_ms' }).notNull(),
})

export const agentTaskArtifacts = sqliteTable(
  'agent_task_artifacts',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => agentTasks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', {
      enum: ['file', 'report', 'export', 'image', 'data', 'other'],
    })
      .notNull()
      .default('file'),
    relativePath: text('relative_path').notNull(),
    absolutePath: text('absolute_path').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    sourceJson: text('source_json').notNull().default('{}'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('agent_task_artifacts_task_created_idx').on(t.taskId, t.createdAt),
    index('agent_task_artifacts_task_rel_path_idx').on(t.taskId, t.relativePath),
  ],
)
