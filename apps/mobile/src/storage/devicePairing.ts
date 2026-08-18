import {
  DevicePairingOfferSchema,
  DevicePairingRecordSchema,
  decodeDevicePairingOffer,
  isLegacyDevicePairingOfferCode,
  isShortPairingCode,
  normalizePairingCode,
  pairingFingerprint,
  pairingRecordFromOffer,
  SYNC_PAIRING_REDEEM_PATH,
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
  await saveOwnedScoped(PAIRING_KEY, null as unknown as DevicePairingRecord, setItem)
}

async function redeemShortPairingCode(input: {
  code: string
  localDeviceId: string
  role: DevicePairingRecord['role']
}) {
  const { resolveReachableMobileSyncBaseUrl, rewriteSyncBaseUrlForClient } = await import(
    '../sync/mobileSync-client'
  )
  const base = rewriteSyncBaseUrlForClient(await resolveReachableMobileSyncBaseUrl())
  const url = `${base.replace(/\/+$/, '')}${SYNC_PAIRING_REDEEM_PATH}`
  const res = await globalThis.fetch.bind(globalThis)(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: input.code,
      localDeviceId: input.localDeviceId,
      role: input.role,
    }),
  })
  const text = await res.text()
  let payload: { offer?: unknown; error?: string } = {}
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {}
  } catch {
    throw new Error('配对服务返回无效响应')
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('配对码不正确')
    throw new Error(payload.error ?? `配对失败（${res.status}）`)
  }
  return DevicePairingOfferSchema.parse(payload.offer)
}

export async function redeemDevicePairingCode(input: {
  code: string
  localDeviceId: string
  role: DevicePairingRecord['role']
}): Promise<DevicePairingRecord> {
  const trimmed = input.code.trim()
  const offer = isLegacyDevicePairingOfferCode(trimmed)
    ? decodeDevicePairingOffer(trimmed)
    : isShortPairingCode(trimmed)
      ? await redeemShortPairingCode({
          code: normalizePairingCode(trimmed),
          localDeviceId: input.localDeviceId,
          role: input.role,
        })
      : (() => {
          throw new Error('请输入 4 位配对码')
        })()
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
