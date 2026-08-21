import {
  emptyTrialQuota,
  normalizeTrialQuota,
  type TrialQuotaState,
} from '@toolman/shared'
import { getOrCreateDeviceId } from './secure'
import { getCurrentDataIdentity, scopedStorageKey } from './identityScope'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const QUOTA_KEY = 'toolman.mobile.trialLlmQuota.v1'

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

async function trialQuotaStoreKey(): Promise<string> {
  const identity = getCurrentDataIdentity()?.trim()
  if (identity) return scopedStorageKey(QUOTA_KEY, identity)
  const deviceId = await getOrCreateDeviceId()
  return `${QUOTA_KEY}::device:${deviceId}`
}

function parseQuota(raw: string | null): TrialQuotaState | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as TrialQuotaState
  } catch {
    return null
  }
}

export async function loadTrialQuota(now = Date.now()): Promise<TrialQuotaState> {
  const key = await trialQuotaStoreKey()
  const raw = await getItem(key)
  return normalizeTrialQuota(parseQuota(raw) ?? emptyTrialQuota(now), now)
}

export async function saveTrialQuota(state: TrialQuotaState): Promise<void> {
  const key = await trialQuotaStoreKey()
  await setItem(key, JSON.stringify(state))
}
