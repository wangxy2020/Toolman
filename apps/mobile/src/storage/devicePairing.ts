import {
  DevicePairingRecordSchema,
  decodeDevicePairingOffer,
  pairingFingerprint,
  pairingRecordFromOffer,
  type DevicePairingRecord,
} from '@toolman/shared'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { loadOwnedScoped, saveOwnedScoped } from './identityScope'

const PAIRING_KEY = 'toolman.mobile.devicePairing.v1'

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

export async function loadDevicePairing(): Promise<DevicePairingRecord | null> {
  const parsed = await loadOwnedScoped<unknown>(PAIRING_KEY, getItem)
  const result = DevicePairingRecordSchema.safeParse(parsed)
  return result.success ? result.data : null
}

export async function saveDevicePairing(record: DevicePairingRecord): Promise<void> {
  await saveOwnedScoped(PAIRING_KEY, DevicePairingRecordSchema.parse(record), setItem)
}

export async function clearDevicePairing(): Promise<void> {
  // Overwrite with empty owned payload so loadOwnedScoped yields null after parse.
  await saveOwnedScoped(PAIRING_KEY, null as unknown as DevicePairingRecord, setItem)
}

export async function redeemDevicePairingCode(input: {
  code: string
  localDeviceId: string
  role: DevicePairingRecord['role']
}): Promise<DevicePairingRecord> {
  const offer = decodeDevicePairingOffer(input.code)
  const record = pairingRecordFromOffer({
    offer,
    localDeviceId: input.localDeviceId,
    role: input.role,
  })
  await saveDevicePairing(record)
  return record
}

export function formatPairingStatus(record: DevicePairingRecord | null): string {
  if (!record) return '未配对桌面设备'
  return `已配对 · ${pairingFingerprint(record.grant)}`
}
