import { and, eq, isNull } from 'drizzle-orm'
import { logStructured } from './structured-log.service'
import {
  createModelGateway,
  DEEPSEEK_PRESET_MODELS,
  isDeprecatedDeepSeekModelId,
} from '@toolman/model-gateway'
import {
  ProviderCreateInputSchema,
  ProviderDeleteInputSchema,
  ProviderFetchModelsInputSchema,
  ProviderListInputSchema,
  ProviderSchema,
  ProviderTestInputSchema,
  ProviderUpdateInputSchema,
  enrichProviderModel,
  type Provider,
  type ProviderModel,
} from '@toolman/shared'
import { providers } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'
import { randomUUID } from 'node:crypto'
import {
  decryptSecret,
  encryptSecret,
  isSecretStorageAvailable,
} from './secret-store'

const gateway = createModelGateway()

function mergePresetModels(
  presetModels: ReadonlyArray<{ id: string; name: string }>,
  fetched: ProviderModel[],
  existingById: Map<string, ProviderModel>,
): ProviderModel[] {
  const merged = new Map(fetched.map((model) => [model.id, model]))
  for (const preset of presetModels) {
    if (merged.has(preset.id)) continue
    const prev = existingById.get(preset.id)
    merged.set(
      preset.id,
      enrichProviderModel({
        ...(prev ?? {}),
        id: preset.id,
        name: preset.name,
      }),
    )
  }
  return [...merged.values()]
}

export const NON_CHAT_MODEL = /bge|embed|nomic/i

export function isChatModelId(modelId: string): boolean {
  return !NON_CHAT_MODEL.test(modelId)
}

function readPresetId(config: Record<string, unknown>): string | null {
  const presetId = config.presetId
  return typeof presetId === 'string' && presetId.length > 0 ? presetId : null
}

function readApiKeyRotate(config: Record<string, unknown>): boolean {
  return config.apiKeyRotate === true
}

function mergeConfig(
  existing: Record<string, unknown>,
  patch: { presetId?: string; apiKeyRotate?: boolean },
): Record<string, unknown> {
  const next = stripLegacyApiKey({ ...existing })
  if (patch.presetId !== undefined) {
    next.presetId = patch.presetId
  }
  if (patch.apiKeyRotate !== undefined) {
    next.apiKeyRotate = patch.apiKeyRotate
  }
  return next
}

function parseConfig(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

function readLegacyApiKey(config: Record<string, unknown>): string | null {
  const legacy = config._apiKey
  return typeof legacy === 'string' && legacy.length > 0 ? legacy : null
}

function resolveApiKey(row: typeof providers.$inferSelect): string | null {
  const fromKeychain = decryptSecret(row.apiKeyRef)
  if (fromKeychain) return fromKeychain
  return readLegacyApiKey(parseConfig(row.configJson))
}

function providerHasApiKey(row: typeof providers.$inferSelect): boolean {
  if (row.type === 'ollama') return true
  return Boolean(resolveApiKey(row))
}

function stripLegacyApiKey(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config }
  delete next._apiKey
  return next
}

function persistApiKey(apiKey: string | undefined | null): string | null {
  if (apiKey === undefined) return null
  if (!apiKey) return null
  return encryptSecret(apiKey)
}

function toProvider(row: typeof providers.$inferSelect): Provider {
  const config = parseConfig(row.configJson)
  const rawModels = JSON.parse(row.modelsJson) as ProviderModel[]
  const models = rawModels.map((model) => enrichProviderModel(model))

  return ProviderSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    type: row.type,
    baseUrl: row.baseUrl,
    isEnabled: row.isEnabled,
    presetId: readPresetId(config),
    models,
    hasApiKey: providerHasApiKey(row),
    apiKeyRotate: readApiKeyRotate(config),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

function rowToConfig(row: typeof providers.$inferSelect) {
  return {
    type: row.type,
    baseUrl: row.baseUrl,
    apiKey: resolveApiKey(row),
  }
}

/** 将 config_json 中的明文 _apiKey 迁移到系统 Keychain（api_key_ref） */
export function migratePlaintextApiKeys(): void {
  if (!isSecretStorageAvailable()) {
    logStructured('secret.store', 'warn', `加密不可用，跳过明文 API Key 迁移`)
    return
  }

  const db = getDatabase()
  const rows = db
    .select()
    .from(providers)
    .where(isNull(providers.deletedAt))
    .all()

  for (const row of rows) {
    const config = parseConfig(row.configJson)
    const legacyKey = readLegacyApiKey(config)
    if (!legacyKey) continue

    try {
      const apiKeyRef = encryptSecret(legacyKey)
      db.update(providers)
        .set({
          apiKeyRef,
          configJson: JSON.stringify(stripLegacyApiKey(config)),
          updatedAt: new Date(),
        })
        .where(eq(providers.id, row.id))
        .run()
      logStructured('secret.store', 'info', `已迁移 Provider ${row.id} 的 API Key 到 Keychain`)
    } catch (error) {
      logStructured('secret.store', 'error', `迁移 Provider ${row.id} 失败:`, { detail: error })
    }
  }
}

export function listProviders(input: unknown): Provider[] {
  const data = ProviderListInputSchema.parse(input)
  const db = getDatabase()

  const rows = db
    .select()
    .from(providers)
    .where(and(eq(providers.workspaceId, data.workspaceId), isNull(providers.deletedAt)))
    .all()

  return rows
    .filter((r: typeof providers.$inferSelect) => (data.enabledOnly ? r.isEnabled : true))
    .map(toProvider)
}

/** 文档处理默认使用本地 Ollama 服务商 */
export function resolveDefaultDocProcessorProviderId(workspaceId: string): string | null {
  const items = listProviders({ workspaceId, enabledOnly: true })
  const ollama = items.find((provider) => provider.type === 'ollama')
  return ollama?.id ?? null
}

export function getProviderConfig(providerId: string) {
  const row = getProviderRow(providerId)
  if (!row || !row.isEnabled) return null
  return rowToConfig(row)
}

export function getProviderRow(providerId: string) {
  const db = getDatabase()
  const row = db.select().from(providers).where(eq(providers.id, providerId)).get()
  if (!row || row.deletedAt) return null
  return row
}

export function createProvider(input: unknown): Provider {
  const data = ProviderCreateInputSchema.parse(input)
  const db = getDatabase()
  const now = new Date()
  const id = randomUUID()

  const apiKeyRef = data.apiKey ? encryptSecret(data.apiKey) : null

  const configJson = data.presetId ? JSON.stringify({ presetId: data.presetId }) : '{}'

  const row = {
    id,
    workspaceId: data.workspaceId,
    name: data.name,
    type: data.type,
    baseUrl: data.baseUrl ?? (data.type === 'ollama' ? 'http://127.0.0.1:11434/v1' : null),
    apiKeyRef,
    configJson,
    createdAt: now,
    updatedAt: now,
  }

  db.insert(providers).values(row).run()
  return toProvider({ ...row, isEnabled: true, modelsJson: '[]', sortOrder: 0 })
}

export function updateProvider(input: unknown): Provider | null {
  const data = ProviderUpdateInputSchema.parse(input)
  const db = getDatabase()
  const existing = getProviderRow(data.id)
  if (!existing) return null

  const config = mergeConfig(parseConfig(existing.configJson), {
    presetId: data.presetId,
    apiKeyRotate: data.apiKeyRotate,
  })
  const nextApiKeyRef =
    data.apiKey !== undefined ? persistApiKey(data.apiKey) : existing.apiKeyRef

  const now = new Date()
  db.update(providers)
    .set({
      name: data.name ?? existing.name,
      type: data.type ?? existing.type,
      baseUrl: data.baseUrl !== undefined ? data.baseUrl : existing.baseUrl,
      isEnabled: data.isEnabled ?? existing.isEnabled,
      apiKeyRef: nextApiKeyRef,
      modelsJson: data.models !== undefined
        ? JSON.stringify(data.models.map((model) => enrichProviderModel(model)))
        : existing.modelsJson,
      configJson: JSON.stringify(config),
      updatedAt: now,
    })
    .where(eq(providers.id, data.id))
    .run()

  const updated = db.select().from(providers).where(eq(providers.id, data.id)).get()
  return updated ? toProvider(updated) : null
}

export async function testProvider(input: unknown) {
  const data = ProviderTestInputSchema.parse(input)
  const row = getProviderRow(data.id)
  if (!row) throw new Error('Provider not found')

  const config = rowToConfig(row)
  if (data.baseUrl !== undefined) config.baseUrl = data.baseUrl
  if (data.apiKey !== undefined) config.apiKey = data.apiKey || null

  return gateway.testConnection(config)
}

export function deleteProvider(input: unknown): boolean {
  const { id } = ProviderDeleteInputSchema.parse(input)
  const db = getDatabase()
  const existing = getProviderRow(id)
  if (!existing) return false

  const presetId = readPresetId(parseConfig(existing.configJson))
  if (existing.type === 'ollama' || presetId === 'ollama') {
    throw new Error('内置本地模型服务不可删除')
  }

  db.update(providers)
    .set({ deletedAt: new Date(), updatedAt: new Date(), isEnabled: false })
    .where(eq(providers.id, id))
    .run()
  return true
}

export async function fetchProviderModels(input: unknown) {
  const { id, persist } = ProviderFetchModelsInputSchema.parse(input)
  const db = getDatabase()
  const row = getProviderRow(id)
  if (!row) throw new Error('Provider not found')

  const existing = JSON.parse(row.modelsJson) as ProviderModel[]
  const existingById = new Map(existing.map((model) => [model.id, model]))

  let raw: Awaited<ReturnType<typeof gateway.fetchModels>> = []
  try {
    raw = await gateway.fetchModels(rowToConfig(row))
  } catch (error) {
    if (readPresetId(parseConfig(row.configJson)) !== 'deepseek') {
      throw error
    }
  }

  const fetched = raw.map((item) => {
    const prev = existingById.get(item.id)
    return enrichProviderModel({
      ...(prev ?? {}),
      id: item.id,
      name: item.name,
    })
  })

  const models = (
    readPresetId(parseConfig(row.configJson)) === 'deepseek'
      ? mergePresetModels(DEEPSEEK_PRESET_MODELS, fetched, existingById)
      : fetched
  ).filter((model) => !isDeprecatedDeepSeekModelId(model.id))

  if (persist) {
    db.update(providers)
      .set({
        modelsJson: JSON.stringify(models),
        updatedAt: new Date(),
      })
      .where(eq(providers.id, id))
      .run()
  }

  return { models }
}

/** 启动时从本地 Ollama 同步可用对话模型 */
export async function syncOllamaProviders(workspaceId: string): Promise<void> {
  const rows = listProviders({ workspaceId, enabledOnly: true }).filter((p) => p.type === 'ollama')
  for (const provider of rows) {
    try {
      await fetchProviderModels({ id: provider.id })
    } catch (error) {
      logStructured('syncOllama', 'error', `${provider.name}:`, { detail: error })
    }
  }
}

export { parseModelId, formatModelId } from '@toolman/model-gateway'
