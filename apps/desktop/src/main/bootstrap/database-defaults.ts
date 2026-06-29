import { eq } from 'drizzle-orm'
import { AuthSessionRepository, type ToolmanDatabase } from '@toolman/db'
import { assistants, providers, workspaces, identities } from '@toolman/db'
import { DEFAULT_LOCAL_MODEL } from '@toolman/db'

export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'
export const DEFAULT_ASSISTANT_ID = '00000000-0000-0000-0000-000000000003'
export const DEFAULT_PROVIDER_ID = '00000000-0000-0000-0000-000000000004'

export function ensureDevIdentityRow(
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

export function ensureWorkspaceDefaults(database: ToolmanDatabase) {
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
