import { fireAndForget } from '../lib/fire-and-forget'
import { logStructured } from '../services/structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import {
  createDatabase,
  runMigrations,
  getMigrationsPath,
  getSqliteClient,
  seedDefaultData,
  type ToolmanDatabase,
} from '@toolman/db'
import { app } from 'electron'
import { join } from 'node:path'
import { recoverStaleStreamingMessages } from '../services/agent.service'
import { syncOllamaProviders, migratePlaintextApiKeys } from '../services/provider.service'
import { ensureFtsIndexReady } from '../services/knowledge-fts.service'
import { initAuthSessionStore } from '../services/auth-session.service'
import { syncAuthingUserProfileAfterLogin } from '../services/auth/authing-user-profile.service'
import { exchangeAuthHubToken } from '../services/auth/auth-hub-token.service'
import { getAuthSession } from '../services/auth-session.service'
import { cleanupMisplacedP2pMirrorKnowledgeBases } from '../services/p2p/p2p-knowledge-cleanup.service'
import { migrateAllLegacyGroupSavedKnowledgeBases } from '../services/p2p/p2p-group-saved-knowledge-migration.service'
import { migrateAllDefaultFolderKnowledgeBases } from '../services/knowledge-default-folder-kb.service'
import { bootstrapToolmanUserDocumentLayout } from '../services/knowledge-folder.service'
import { getLocalIdentityId } from '../services/local-identity'
import {
  DEFAULT_WORKSPACE_ID,
  ensureDevIdentityRow,
  ensureWorkspaceDefaults,
} from './database-defaults'
import { resolveDbPackageRoot } from './database-package-root'

let db: ToolmanDatabase | null = null

export function getDatabase(): ToolmanDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function bootstrapDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'toolman.db')
  db = createDatabase(dbPath)

  const packageRoot = resolveDbPackageRoot()
  runMigrations(db, getMigrationsPath(packageRoot))
  try {
    const integrity = getSqliteClient(db).prepare('PRAGMA integrity_check').get() as
      | { integrity_check?: string }
      | undefined
    const result = integrity?.integrity_check ?? 'unknown'
    if (result !== 'ok') {
      logStructured('db', 'error', `integrity_check failed: ${result}`)
    }
  } catch (error) {
    logStructured('db', 'warn', `integrity_check skipped: ${toErrorMessage(error, String(error))}`)
  }
  const localIdentityId = getLocalIdentityId()
  const localDisplayName =
    localIdentityId === '00000000-0000-4000-8000-00000000000b' ? 'P2P 用户 B' : '本地用户'
  seedDefaultData(db, { identityId: localIdentityId, displayName: localDisplayName })
  ensureDevIdentityRow(db, localIdentityId, localDisplayName)
  ensureWorkspaceDefaults(db)
  initAuthSessionStore()
  fireAndForget('bootstrap', (async () => {
    await syncAuthingUserProfileAfterLogin().catch(() => undefined)
    const session = getAuthSession()
    if (session.isLoggedIn) {
      await exchangeAuthHubToken().catch(() => undefined)
    }
  })())
  migratePlaintextApiKeys()
  recoverStaleStreamingMessages()
  ensureFtsIndexReady()
  fireAndForget('bootstrap', syncOllamaProviders(DEFAULT_WORKSPACE_ID))
  try {
    const { migratedWorkspaces, userRoot } = bootstrapToolmanUserDocumentLayout()
    if (migratedWorkspaces > 0) {
      logStructured('knowledge', 'info', `migrated Toolman folders to user-scoped layout for ${migratedWorkspaces} workspace(s)`)
    }
    logStructured('knowledge', 'info', `user document root ready at ${userRoot}`)
    const defaultFolderMigration = migrateAllDefaultFolderKnowledgeBases()
    if (defaultFolderMigration.migratedKinds > 0) {
      logStructured('knowledge', 'info', `default folder KB layout ready for ${defaultFolderMigration.workspaceCount} workspace(s)`)
    }
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    logStructured('knowledge', 'error', `folder bootstrap failed: ${message}`)
  }
  void migrateAllLegacyGroupSavedKnowledgeBases()
    .then((result) => {
      if (result.migratedKbCount > 0 || result.upgradedKbCount > 0 || result.recoveredDocCount > 0) {
        logStructured('p2p', 'info', `group saved knowledge bootstrap: migrated=${result.migratedKbCount} upgraded=${result.upgradedKbCount} recoveredDocs=${result.recoveredDocCount}`)
      }
      return cleanupMisplacedP2pMirrorKnowledgeBases()
    })
    .then((result) => {
      const { purgedKbCount, restoredKbCount, removedDocCount } = result
      if (purgedKbCount > 0 || restoredKbCount > 0 || removedDocCount > 0) {
        logStructured('p2p', 'info', `cleaned misplaced mirror knowledge bases: purged=${purgedKbCount} restored=${restoredKbCount} docs=${removedDocCount}`)
      }
    })
    .catch((error) => {
      const message = toErrorMessage(error, String(error))
      logStructured('p2p', 'error', `group saved knowledge bootstrap failed: ${message}`)
    })
}
