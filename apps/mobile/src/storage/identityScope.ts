import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  getCurrentDataIdentity,
  parseOwnedPayload,
  scopedStorageKey,
  setAllowLegacyDataClaim,
  setCurrentDataIdentity,
  stringifyOwnedPayload,
} from './identityScopeCore'

export {
  getCurrentDataIdentity,
  parseOwnedPayload,
  scopedStorageKey,
  setAllowLegacyDataClaim,
  setCurrentDataIdentity,
  stringifyOwnedPayload,
}

const OWNER_KEY = 'toolman.mobile.localDataOwner.v1'

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

export async function canClaimLegacyLocalData(
  identityId: string | null = getCurrentDataIdentity(),
): Promise<boolean> {
  const id = identityId?.trim()
  if (!id) return false
  const owner = await getItem(OWNER_KEY)
  return !owner || owner === id
}

export async function markLegacyLocalDataOwner(identityId: string): Promise<void> {
  const id = identityId.trim()
  if (!id) return
  await setItem(OWNER_KEY, id)
}

export async function loadScopedRaw(
  baseKey: string,
  getRaw: (key: string) => Promise<string | null>,
  _setRaw?: (key: string, value: string) => Promise<void>,
  _removeRaw?: (key: string) => Promise<void>,
): Promise<string | null> {
  return getRaw(scopedStorageKey(baseKey))
}

export async function loadOwnedScoped<T>(
  baseKey: string,
  getRaw: (key: string) => Promise<string | null>,
): Promise<T | null> {
  return parseOwnedPayload<T>(await loadScopedRaw(baseKey, getRaw))
}

export async function saveScopedRaw(
  baseKey: string,
  value: string,
  setRaw: (key: string, value: string) => Promise<void>,
): Promise<void> {
  await setRaw(scopedStorageKey(baseKey), value)
}

export async function saveOwnedScoped<T>(
  baseKey: string,
  payload: T,
  setRaw: (key: string, value: string) => Promise<void>,
): Promise<void> {
  await saveScopedRaw(baseKey, stringifyOwnedPayload(payload), setRaw)
}
