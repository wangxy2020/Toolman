import { eq } from 'drizzle-orm'
import {
  createDatabase,
  runMigrations,
  getMigrationsPath,
  seedDefaultData,
  type ToolmanDatabase,
} from '@toolman/db'
import { assistants, providers, workspaces, DEFAULT_LOCAL_MODEL } from '@toolman/db'
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { recoverStaleStreamingMessages } from '../services/agent.service'
import { syncOllamaProviders, migratePlaintextApiKeys } from '../services/provider.service'
import { ensureFtsIndexReady } from '../services/knowledge-fts.service'

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
  seedDefaultData(db)
  ensureWorkspaceDefaults(db)
  migratePlaintextApiKeys()
  recoverStaleStreamingMessages()
  ensureFtsIndexReady()
  void syncOllamaProviders(DEFAULT_WORKSPACE_ID)
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
}

function resolveDbPackageRoot(): string {
  const candidates = [
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
