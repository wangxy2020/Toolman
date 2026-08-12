import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { ModelConfig } from '../state/MobileAppContext'
import {
  DEFAULT_PROVIDER_ID,
  getProviderPreset,
  normalizeChatBaseUrl,
} from '../settings/provider-presets'
import { sanitizeApiKey } from '../chat/apiHeaders'

const MODEL_KEY = 'toolman.mobile.modelConfig'
const TOKEN_KEY = 'toolman.mobile.accessToken'
const IDENTITY_KEY = 'toolman.mobile.identity'
const DEVICE_KEY = 'toolman.mobile.deviceId'

const deepseek = getProviderPreset(DEFAULT_PROVIDER_ID)

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  providerId: DEFAULT_PROVIDER_ID,
  baseUrl: deepseek.defaultBaseUrl,
  apiKey: '',
  model: deepseek.defaultModel,
  localModelEnabled: false,
}

function inferProviderId(raw: Partial<ModelConfig>): string {
  if (raw.providerId) return raw.providerId
  const url = (raw.baseUrl ?? '').toLowerCase()
  if (url.includes('deepseek')) return 'deepseek'
  if (url.includes('openai.com')) return 'openai'
  if (url.includes('moonshot')) return 'moonshot'
  if (url.includes('bigmodel.cn')) return 'zhipu'
  if (url.includes('dashscope') || url.includes('aliyun')) return 'qwen'
  if (url) return 'custom'
  return DEFAULT_PROVIDER_ID
}

function migrateModelConfig(raw: Partial<ModelConfig> & { providerId?: string }): ModelConfig {
  const providerId = inferProviderId(raw)
  const preset = getProviderPreset(providerId)
  const hasSavedUrl = Boolean(raw.baseUrl?.trim())
  return {
    providerId: preset.id,
    baseUrl: normalizeChatBaseUrl(
      hasSavedUrl ? raw.baseUrl! : preset.defaultBaseUrl,
      preset.id,
    ),
    apiKey: sanitizeApiKey(raw.apiKey ?? ''),
    model: raw.model?.trim() || preset.defaultModel,
    localModelEnabled: raw.localModelEnabled ?? false,
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // ignore quota / private mode
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      // ignore
    }
    return
  }
  await SecureStore.deleteItemAsync(key)
}

export async function loadModelConfig(): Promise<ModelConfig> {
  try {
    const raw = await getItem(MODEL_KEY)
    if (!raw) return DEFAULT_MODEL_CONFIG
    return migrateModelConfig(JSON.parse(raw) as Partial<ModelConfig>)
  } catch {
    return DEFAULT_MODEL_CONFIG
  }
}

export async function saveModelConfig(config: ModelConfig): Promise<void> {
  await setItem(
    MODEL_KEY,
    JSON.stringify(
      migrateModelConfig({
        ...config,
        baseUrl: normalizeChatBaseUrl(config.baseUrl, config.providerId),
      }),
    ),
  )
}

export async function loadAccessToken(): Promise<string | null> {
  return getItem(TOKEN_KEY)
}

export async function saveAccessToken(token: string | null): Promise<void> {
  if (!token) {
    await deleteItem(TOKEN_KEY)
    return
  }
  await setItem(TOKEN_KEY, token)
}

export async function loadIdentity(): Promise<{ identityId: string; displayName: string } | null> {
  const raw = await getItem(IDENTITY_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as { identityId: string; displayName: string }
  } catch {
    return null
  }
}

export async function saveIdentity(
  identity: { identityId: string; displayName: string } | null,
): Promise<void> {
  if (!identity) {
    await deleteItem(IDENTITY_KEY)
    return
  }
  await setItem(IDENTITY_KEY, JSON.stringify(identity))
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getItem(DEVICE_KEY)
  if (existing) return existing
  const id = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  await setItem(DEVICE_KEY, id)
  return id
}
