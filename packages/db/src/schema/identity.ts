import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const identities = sqliteTable('identities', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['local', 'linked'] }).notNull().default('local'),
  displayName: text('display_name').notNull(),
  publicKey: text('public_key'),
  avatarHash: text('avatar_hash'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => identities.id),
  settingsJson: text('settings_json').notNull().default('{}'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
