import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core'
import { workspaces } from './identity.js'

export const settings = sqliteTable(
  'settings',
  {
    id: text('id').primaryKey(),
    scope: text('scope', { enum: ['global', 'workspace', 'provider'] }).notNull(),
    scopeId: text('scope_id'),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull().default('{}'),
    secretRef: text('secret_ref'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [unique().on(t.scope, t.scopeId, t.key)],
)

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', {
    enum: ['openai', 'anthropic', 'google', 'ollama', 'openai_compatible', 'azure_openai'],
  }).notNull(),
  baseUrl: text('base_url'),
  apiKeyRef: text('api_key_ref'),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  modelsJson: text('models_json').notNull().default('[]'),
  configJson: text('config_json').notNull().default('{}'),
  sortOrder: integer('sort_order').notNull().default(0),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const assistants = sqliteTable('assistants', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  avatarHash: text('avatar_hash'),
  systemPrompt: text('system_prompt').notNull().default(''),
  modelId: text('model_id').notNull(),
  parametersJson: text('parameters_json').notNull().default('{}'),
  toolsJson: text('tools_json').notNull().default('[]'),
  kbIdsJson: text('kb_ids_json').notNull().default('[]'),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
