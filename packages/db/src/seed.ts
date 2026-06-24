import { eq, isNull } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema/index.js'
import { assistants, identities, providers, workspaces } from './schema/index.js'

type ToolmanDatabase = BetterSQLite3Database<typeof schema>

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'
const DEFAULT_ASSISTANT_ID = '00000000-0000-0000-0000-000000000003'
const DEFAULT_PROVIDER_ID = '00000000-0000-0000-0000-000000000004'
export const DEFAULT_LOCAL_MODEL = 'gemma4:latest'

export function seedDefaultData(
  db: ToolmanDatabase,
  options?: {
    identityId?: string
    displayName?: string
  },
) {
  const now = new Date()
  const identityId = options?.identityId ?? DEFAULT_IDENTITY_ID
  const displayName = options?.displayName ?? '本地用户'

  const existing = db.select().from(identities).where(eq(identities.id, identityId)).get()
  if (existing) return

  db.insert(identities).values({
    id: identityId,
    type: 'local',
    displayName,
    createdAt: now,
    updatedAt: now,
  }).run()

  db.insert(workspaces).values({
    id: DEFAULT_WORKSPACE_ID,
    name: '默认工作区',
    ownerId: identityId,
    settingsJson: JSON.stringify({ theme: 'system', defaultLocale: 'zh-CN' }),
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  }).run()

  db.insert(providers).values({
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
  }).run()

  db.insert(assistants).values({
    id: DEFAULT_ASSISTANT_ID,
    workspaceId: DEFAULT_WORKSPACE_ID,
    name: '通用智能体',
    description: '默认 AI 对话智能体',
    systemPrompt: '你是一个有帮助的 AI 助手。',
    modelId: `${DEFAULT_PROVIDER_ID}:${DEFAULT_LOCAL_MODEL}`,
    parametersJson: JSON.stringify({ temperature: 0.7, maxTokens: 4096 }),
    isBuiltin: true,
    isPinned: true,
    createdAt: now,
    updatedAt: now,
  }).run()
}

export function getDefaultWorkspace(db: ToolmanDatabase) {
  const row = db.select().from(workspaces).where(eq(workspaces.isDefault, true)).get()

  if (row && !row.deletedAt) return row

  return db.select().from(workspaces).where(isNull(workspaces.deletedAt)).get() ?? null
}
