import { logStructured } from '../structured-log.service'
import { enrichProviderModel, type ProviderModel } from '@toolman/shared'
import { providers } from '@toolman/db'
import {
  decryptSecret,
  encryptSecret,
  isSecretStorageAvailable,
} from '../secret-store'
import { eq, isNull } from 'drizzle-orm'
import { getDatabase } from '../../bootstrap/database'

export const NON_CHAT_MODEL = /bge|embed|nomic/i

export function isChatModelId(modelId: string): boolean {
  return !NON_CHAT_MODEL.test(modelId)
}

export function readPresetId(config: Record<string, unknown>): string | null {
  const presetId = config.presetId
  return typeof presetId === 'string' && presetId.length > 0 ? presetId : null
}

export function readApiKeyRotate(config: Record<string, unknown>): boolean {
  return config.apiKeyRotate === true
}

export function mergeConfig(
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

export function parseConfig(json: string): Record<string, unknown> {
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

export function resolveApiKey(row: typeof providers.$inferSelect): string | null {
  const fromKeychain = decryptSecret(row.apiKeyRef)
  if (fromKeychain) return fromKeychain
  return readLegacyApiKey(parseConfig(row.configJson))
}

export function providerHasApiKey(row: typeof providers.$inferSelect): boolean {
  if (row.type === 'ollama') return true
  return Boolean(resolveApiKey(row))
}

export function stripLegacyApiKey(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config }
  delete next._apiKey
  return next
}

export function persistApiKey(apiKey: string | undefined | null): string | null {
  if (apiKey === undefined) return null
  if (!apiKey) return null
  return encryptSecret(apiKey)
}

export function rowToConfig(row: typeof providers.$inferSelect) {
  return {
    type: row.type,
    baseUrl: row.baseUrl,
    apiKey: resolveApiKey(row),
  }
}

export function mergePresetModels(
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

export type ProviderRow = typeof providers.$inferSelect
