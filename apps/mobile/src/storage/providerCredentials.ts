import { sanitizeApiKey } from '../chat/apiHeaders'

export type ProviderCredential = {
  apiKey: string
  baseUrl?: string
  model?: string
}

export type ProviderCredentialMap = Record<string, ProviderCredential>

export function readProviderCredential(
  map: ProviderCredentialMap | undefined,
  providerId: string,
): ProviderCredential | undefined {
  const value = map?.[providerId]
  if (!value || typeof value !== 'object') return undefined
  const apiKey = sanitizeApiKey(value.apiKey ?? '')
  const baseUrl = value.baseUrl?.trim()
  const model = value.model?.trim()
  if (!apiKey && !baseUrl && !model) return undefined
  return {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {}),
  }
}

export function upsertProviderCredentials(
  existing: ProviderCredentialMap | undefined,
  providerId: string,
  cred: ProviderCredential,
): ProviderCredentialMap {
  const next: ProviderCredentialMap = { ...(existing ?? {}) }
  const apiKey = sanitizeApiKey(cred.apiKey)
  const baseUrl = cred.baseUrl?.trim()
  const model = cred.model?.trim()
  if (!apiKey && !baseUrl && !model) {
    delete next[providerId]
    return next
  }
  next[providerId] = {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {}),
  }
  return next
}

export function sanitizeCredentialMap(raw: unknown): ProviderCredentialMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const next: ProviderCredentialMap = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !value || typeof value !== 'object' || Array.isArray(value)) continue
    const cred = value as ProviderCredential
    const apiKey = sanitizeApiKey(cred.apiKey ?? '')
    const baseUrl = typeof cred.baseUrl === 'string' ? cred.baseUrl.trim() : ''
    const model = typeof cred.model === 'string' ? cred.model.trim() : ''
    if (!apiKey && !baseUrl && !model) continue
    next[id] = {
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
    }
  }
  return next
}
