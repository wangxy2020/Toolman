import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { loadOwnedScoped, saveOwnedScoped } from './identityScope'

const STORE_KEY = 'toolman.mobile.created-kbs.v1'

export type MobileCreatedKbKind = 'local' | 'sync' | 'network'

export type MobileCreatedKb = {
  id: string
  name: string
  kind: MobileCreatedKbKind
  description?: string
  networkUrl?: string
  watchInclude?: string
  watchExclude?: string
  watchDebounceMs?: number
  urlRefreshIntervalHours?: number
  updatedAt: number
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
      // ignore
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

function normalizeKb(value: unknown): MobileCreatedKb | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<MobileCreatedKb>
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null
  if (item.kind !== 'local' && item.kind !== 'sync' && item.kind !== 'network') return null
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    description: typeof item.description === 'string' ? item.description : undefined,
    networkUrl: typeof item.networkUrl === 'string' ? item.networkUrl : undefined,
    watchInclude: typeof item.watchInclude === 'string' ? item.watchInclude : undefined,
    watchExclude: typeof item.watchExclude === 'string' ? item.watchExclude : undefined,
    watchDebounceMs:
      typeof item.watchDebounceMs === 'number' && Number.isFinite(item.watchDebounceMs)
        ? item.watchDebounceMs
        : undefined,
    urlRefreshIntervalHours:
      typeof item.urlRefreshIntervalHours === 'number' && Number.isFinite(item.urlRefreshIntervalHours)
        ? item.urlRefreshIntervalHours
        : undefined,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
  }
}

export async function loadCreatedKnowledgeBases(): Promise<MobileCreatedKb[]> {
  try {
    const parsed = await loadOwnedScoped<unknown>(STORE_KEY, getItem)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeKb).filter((item): item is MobileCreatedKb => item != null)
  } catch {
    return []
  }
}

export async function saveCreatedKnowledgeBases(items: MobileCreatedKb[]): Promise<void> {
  await saveOwnedScoped(STORE_KEY, items, setItem)
}

export function createKnowledgeBaseId(): string {
  return `kb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
