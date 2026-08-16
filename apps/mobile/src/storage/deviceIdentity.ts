import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  bindIdentityToDevice,
  normalizeDeviceIdentity,
  shouldKeepLegacyDeviceId,
  type MobileDeviceIdentity,
} from './deviceIdentityCore'

export type { MobileDeviceIdentity, MobileDeviceKind } from './deviceIdentityCore'
export {
  bindIdentityToDevice,
  createMobileDeviceId,
  normalizeDeviceIdentity,
  shouldKeepLegacyDeviceId,
} from './deviceIdentityCore'

const LEGACY_DEVICE_KEY = 'toolman.mobile.deviceId'
const DEVICE_IDENTITY_KEY = 'toolman.mobile.deviceIdentity.v1'

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

export async function loadOrCreateDeviceIdentity(): Promise<MobileDeviceIdentity> {
  const raw = await getItem(DEVICE_IDENTITY_KEY)
  if (raw) {
    try {
      return normalizeDeviceIdentity(JSON.parse(raw) as Partial<MobileDeviceIdentity>)
    } catch {
      // fall through to legacy / create
    }
  }
  const legacy = await getItem(LEGACY_DEVICE_KEY)
  const device = normalizeDeviceIdentity(
    null,
    legacy && shouldKeepLegacyDeviceId(legacy) ? legacy : undefined,
  )
  await persistDeviceIdentity(device)
  return device
}

export async function persistDeviceIdentity(device: MobileDeviceIdentity): Promise<void> {
  await setItem(DEVICE_IDENTITY_KEY, JSON.stringify(device))
  await setItem(LEGACY_DEVICE_KEY, device.deviceId)
}

export async function bindStoredDeviceIdentity(
  identityId: string | null,
): Promise<MobileDeviceIdentity> {
  const current = await loadOrCreateDeviceIdentity()
  const next = bindIdentityToDevice(current, identityId)
  if (next === current) return current
  await persistDeviceIdentity(next)
  return next
}
