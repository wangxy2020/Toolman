import {
  DevicePairingOfferSchema,
  DevicePairingRecordSchema,
  decodeDevicePairingOffer,
  isLegacyDevicePairingOfferCode,
  isShortPairingCode,
  listPairingRedeemBaseUrlCandidates,
  normalizePairingCode,
  pairingFingerprint,
  pairingRecordFromOffer,
  SYNC_PAIRING_REDEEM_PATH,
  type DevicePairingOffer,
  type DevicePairingRecord,
} from '@toolman/shared'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { loadOwnedScoped, saveOwnedScoped } from './identityScope'
import { loadModulePrefs } from '../settings/prefs'
import { isHostedWebPage } from '../sync/desktopDevHost'
import { fetchWithLocalNetwork, localNetworkRequestTimeoutMs } from '../sync/localNetworkFetch'

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

function pairingUnreachableMessage(): string {
  if (isHostedWebPage()) {
    return '无法连接本机桌面端完成配对。请确认桌面端已打开，并在浏览器弹出的本地网络权限中选择允许（建议 Chrome / Edge）。'
  }
  return '无法连接桌面 Sync Hub 完成配对。请确认桌面端已打开。'
}

async function redeemAt(
  base: string,
  body: { code: string; localDeviceId: string; role: DevicePairingRecord['role'] },
): Promise<{ kind: 'offer'; offer: DevicePairingOffer } | { kind: 'auth' } | { kind: 'miss' }> {
  const origin = base.replace(/\/+$/, '')
  const url = `${origin}${SYNC_PAIRING_REDEEM_PATH}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), localNetworkRequestTimeoutMs(url))
  try {
    const res = await fetchWithLocalNetwork(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      mode: 'cors',
    })
    const text = await res.text()
    let payload: { offer?: unknown; error?: string } = {}
    try {
      payload = text ? (JSON.parse(text) as typeof payload) : {}
    } catch {
      return { kind: 'miss' }
    }
    if (res.status === 401) return { kind: 'auth' }
    if (!res.ok) return { kind: 'miss' }
    return { kind: 'offer', offer: DevicePairingOfferSchema.parse(payload.offer) }
  } catch {
    return { kind: 'miss' }
  } finally {
    clearTimeout(timer)
  }
}

async function redeemShortPairingCode(input: {
  code: string
  localDeviceId: string
  role: DevicePairingRecord['role']
}) {
  const prefs = await loadModulePrefs()
  const body = {
    code: input.code,
    localDeviceId: input.localDeviceId,
    role: input.role,
  }
  let sawAuthFailure = false
  for (const base of listPairingRedeemBaseUrlCandidates({
    configuredSyncBaseUrl: prefs.sync?.hubBaseUrl,
  })) {
    const result = await redeemAt(base, body)
    if (result.kind === 'offer') return result.offer
    if (result.kind === 'auth') sawAuthFailure = true
  }
  if (sawAuthFailure) throw new Error('配对码不正确')
  throw new Error(pairingUnreachableMessage())
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
