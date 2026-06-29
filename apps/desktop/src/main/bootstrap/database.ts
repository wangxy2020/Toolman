import { eq } from 'drizzle-orm'
import { fireAndForget } from '../lib/fire-and-forget'
import { logStructured } from '../services/structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import {
  createDatabase,
  runMigrations,
  getMigrationsPath,
  getSqliteClient,
  seedDefaultData,
  AuthSessionRepository,
  type ToolmanDatabase,
} from '@toolman/db'
import { assistants, providers, workspaces, identities, DEFAULT_LOCAL_MODEL } from '@toolman/db'
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
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

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'
const DEFAULT_ASSISTANT_ID = '00000000-0000-0000-0000-000000000003'
const DEFAULT_PROVIDER_ID = '00000000-0000-0000-0000-000000000004'

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

function ensureDevIdentityRow(
  database: ToolmanDatabase,
  identityId: string,
  displayName: string,
) {
  const existing = database
    .select()
    .from(identities)
    .where(eq(identities.id, identityId))
    .get()
  if (existing) return

  const now = new Date()
  database
    .insert(identities)
    .values({
      id: identityId,
      type: 'local',
      displayName,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const sessionRepo = new AuthSessionRepository(database)
  sessionRepo.ensureCurrent(identityId)
}

function ensureWorkspaceDefaults(database: ToolmanDatabase) {
  const now = new Date()
  const workspace = database
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, DEFAULT_WORKSPACE_ID))
    .get()

  if (!workspace) return

  const provider = database
    .select()
    .from(providers)
    .where(eq(providers.id, DEFAULT_PROVIDER_ID))
    .get()

  const defaultModelId = `${DEFAULT_PROVIDER_ID}:${DEFAULT_LOCAL_MODEL}`
  const needsProviderMigration =
    !provider || provider.type !== 'ollama' || provider.name === 'OpenAI'

  if (!provider) {
    database
      .insert(providers)
      .values({
        id: DEFAULT_PROVIDER_ID,
        workspaceId: DEFAULT_WORKSPACE_ID,
        name: 'Ollama',
        type: 'ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelsJson: '[]',
        configJson: JSON.stringify({ presetId: 'ollama' }),
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  } else if (needsProviderMigration) {
    database
      .update(providers)
      .set({
        name: 'Ollama',
        type: 'ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        configJson: JSON.stringify({ presetId: 'ollama' }),
        updatedAt: now,
      })
      .where(eq(providers.id, DEFAULT_PROVIDER_ID))
      .run()
  } else if (provider && provider.type === 'ollama') {
    try {
      const config = JSON.parse(provider.configJson) as { presetId?: string }
      if (!config.presetId) {
        database
          .update(providers)
          .set({
            configJson: JSON.stringify({ ...config, presetId: 'ollama' }),
            updatedAt: now,
          })
          .where(eq(providers.id, DEFAULT_PROVIDER_ID))
          .run()
      }
    } catch {
      database
        .update(providers)
        .set({
          configJson: JSON.stringify({ presetId: 'ollama' }),
          updatedAt: now,
        })
        .where(eq(providers.id, DEFAULT_PROVIDER_ID))
        .run()
    }
  }

  const assistant = database
    .select()
    .from(assistants)
    .where(eq(assistants.id, DEFAULT_ASSISTANT_ID))
    .get()

  const needsAssistantMigration =
    assistant &&
    (needsProviderMigration ||
      assistant.modelId.includes('gpt-4') ||
      !assistant.modelId.startsWith(`${DEFAULT_PROVIDER_ID}:`))

  if (needsAssistantMigration) {
    database
      .update(assistants)
      .set({
        modelId: defaultModelId,
        updatedAt: now,
      })
      .where(eq(assistants.id, DEFAULT_ASSISTANT_ID))
      .run()
  } else if (
    assistant &&
    assistant.modelId === `${DEFAULT_PROVIDER_ID}:gemma4:26b`
  ) {
    database
      .update(assistants)
      .set({
        modelId: defaultModelId,
        updatedAt: now,
      })
      .where(eq(assistants.id, DEFAULT_ASSISTANT_ID))
      .run()
  }

  if (assistant?.name === '通用助手') {
    database
      .update(assistants)
      .set({
        name: '通用智能体',
        description: '默认 AI 对话智能体',
        updatedAt: now,
      })
      .where(eq(assistants.id, DEFAULT_ASSISTANT_ID))
      .run()
  }

  const latestAssistant = database
    .select()
    .from(assistants)
    .where(eq(assistants.id, DEFAULT_ASSISTANT_ID))
    .get()

  if (latestAssistant?.isBuiltin) {
    let parametersJson = latestAssistant.parametersJson
    try {
      const params = JSON.parse(latestAssistant.parametersJson) as Record<string, unknown>
      if (params.p2pGroupSharedMirror || params.p2pGroupProxy) {
        delete params.p2pGroupSharedMirror
        delete params.p2pGroupProxy
        parametersJson = JSON.stringify(params)
      }
    } catch {
      // keep existing parametersJson
    }

    if (
      latestAssistant.deletedAt ||
      latestAssistant.name !== '通用智能体' ||
      parametersJson !== latestAssistant.parametersJson
    ) {
      database
        .update(assistants)
        .set({
          deletedAt: null,
          name: '通用智能体',
          description: '默认 AI 对话智能体',
          parametersJson,
          updatedAt: now,
        })
        .where(eq(assistants.id, DEFAULT_ASSISTANT_ID))
        .run()
    }
  }
}

function resolveDbPackageRoot(): string {
  const candidates = [
    join(app.getAppPath(), 'node_modules', '@toolman', 'db'),
    join(process.resourcesPath, 'app.asar', 'node_modules', '@toolman', 'db'),
    join(process.cwd(), 'packages', 'db'),
    join(process.cwd(), '..', '..', 'packages', 'db'),
    join(app.getAppPath(), '..', '..', 'packages', 'db'),
  ]

  for (const candidate of candidates) {
    const journal = join(candidate, 'migrations', 'meta', '_journal.json')
    if (existsSync(journal)) return candidate
  }

  throw new Error('Could not locate @toolman/db migrations folder')
}
