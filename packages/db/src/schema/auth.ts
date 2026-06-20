import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { identities } from './identity.js'

export const AUTH_SESSION_SLOT = 'current'

export const authBindings = sqliteTable(
  'auth_bindings',
  {
    id: text('id').primaryKey(),
    identityId: text('identity_id')
      .notNull()
      .references(() => identities.id),
    provider: text('provider', {
      enum: [
        'firebase_email',
        'firebase_google',
        'firebase_apple',
        'tencent_phone',
        'tencent_wechat',
      ],
    }).notNull(),
    subjectId: text('subject_id').notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    providerSubjectUnique: uniqueIndex('auth_bindings_provider_subject_unique').on(
      table.provider,
      table.subjectId,
    ),
  }),
)

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  identityId: text('identity_id').references(() => identities.id),
  isLoggedIn: integer('is_logged_in', { mode: 'boolean' }).notNull().default(false),
  preferredRegion: text('preferred_region', { enum: ['cn', 'intl'] }),
  accessTokenRef: text('access_token_ref'),
  refreshTokenRef: text('refresh_token_ref'),
  idTokenRef: text('id_token_ref'),
  hubTokenRef: text('hub_token_ref'),
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp_ms' }),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
