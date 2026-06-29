import { createModelGateway } from '@toolman/model-gateway'
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
import { and, eq, isNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDatabase } from '../../bootstrap/database'
import { encryptSecret } from '../secret-store'
import { resolveDefaultDocProcessorProviderIdFromRuntime } from '../runtime-app-settings.service'
import {
  DEEPSEEK_PRESET_MODELS,
  isDeprecatedDeepSeekModelId,
} from '@toolman/model-gateway'
import {
  mergeConfig,
  mergePresetModels,
  parseConfig,
  persistApiKey,
  providerHasApiKey,
  readApiKeyRotate,
  readPresetId,
  rowToConfig,
  type ProviderRow,
} from './helpers'

const gateway = createModelGateway()

function toProvider(row: ProviderRow): Provider {
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

export function getProviderRow(providerId: string) {
  const db = getDatabase()
  const row = db.select().from(providers).where(eq(providers.id, providerId)).get()
  if (!row || row.deletedAt) return null
  return row
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
    .filter((r: ProviderRow) => (data.enabledOnly ? r.isEnabled : true))
    .map(toProvider)
}

/** 文档处理默认使用本地 Ollama 服务商 */
export function resolveDefaultDocProcessorProviderId(workspaceId: string): string | null {
  const fromRuntime = resolveDefaultDocProcessorProviderIdFromRuntime()
  if (fromRuntime) {
    const row = getProviderRow(fromRuntime)
    if (row?.isEnabled && row.workspaceId === workspaceId) {
      return fromRuntime
    }
  }

  const items = listProviders({ workspaceId, enabledOnly: true })
  const ollama = items.find((provider) => provider.type === 'ollama')
  return ollama?.id ?? null
}

export function getProviderConfig(providerId: string) {
  const row = getProviderRow(providerId)
  if (!row || !row.isEnabled) return null
  return rowToConfig(row)
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
