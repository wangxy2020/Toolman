/**
 * Same-account device pairing for personal (point-to-point) sync.
 * Secrets live on desktop; mobile/web redeem a short-lived offer code.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  createDevicePairingSecrets,
  encodeDevicePairingOffer,
  isPersonalSyncWorkspaceId,
  personalSyncWorkspaceId,
  type DevicePairingOffer,
  type DevicePairingRecord,
} from '@toolman/shared'
import { resolveDeviceSyncIdentityIdDesktop } from './community-device-sync'
import { getMobileSyncHubBaseUrl } from './mobile-sync-hub'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { saveWorkspaceKey } from './p2p/p2p-workspace-key.store'

type PersonalPairingStore = {
  identityId: string
  desktopDeviceId: string
  workspaceKeyB64: string
  grant: string
  pairedDevices: Array<{
    deviceId: string
    role: DevicePairingRecord['role']
    pairedAt: number
  }>
  updatedAt: number
}

const OFFER_TTL_MS = 30 * 60 * 1000

function storePath(): string {
  return join(app.getPath('userData'), 'mobile-sync', 'personal-pairing.json')
}

function readStore(): PersonalPairingStore | null {
  try {
    const path = storePath()
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8')) as PersonalPairingStore
  } catch {
    return null
  }
}

function writeStore(store: PersonalPairingStore): void {
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function ensureStore(): PersonalPairingStore {
  const identityId = resolveDeviceSyncIdentityIdDesktop()
  const device = getP2pDeviceInfo()
  const existing = readStore()
  if (
    existing &&
    existing.identityId === identityId &&
    existing.desktopDeviceId === device.deviceId &&
    existing.workspaceKeyB64 &&
    existing.grant
  ) {
    return existing
  }
  const secrets = createDevicePairingSecrets()
  const next: PersonalPairingStore = {
    identityId,
    desktopDeviceId: device.deviceId,
    workspaceKeyB64: secrets.workspaceKeyB64,
    grant: secrets.grant,
    pairedDevices: existing?.identityId === identityId ? existing.pairedDevices ?? [] : [],
    updatedAt: Date.now(),
  }
  writeStore(next)
  saveWorkspaceKey(personalSyncWorkspaceId(identityId), next.workspaceKeyB64)
  return next
}

export function getOrCreatePersonalPairingStore(): PersonalPairingStore {
  return ensureStore()
}

export function createPersonalPairingOffer(): { offer: DevicePairingOffer; code: string } {
  const store = ensureStore()
  const now = Date.now()
  const hubBaseUrl = getMobileSyncHubBaseUrl()
  const offer: DevicePairingOffer = {
    v: 1,
    identityId: store.identityId,
    desktopDeviceId: store.desktopDeviceId,
    workspaceKeyB64: store.workspaceKeyB64,
    grant: store.grant,
    hubBaseUrlHint: hubBaseUrl || undefined,
    createdAt: now,
    expiresAt: now + OFFER_TTL_MS,
  }
  return { offer, code: encodeDevicePairingOffer(offer) }
}

export function rememberPairedDevice(input: {
  deviceId: string
  role: DevicePairingRecord['role']
}): void {
  const store = ensureStore()
  const rest = store.pairedDevices.filter((item) => item.deviceId !== input.deviceId)
  writeStore({
    ...store,
    pairedDevices: [...rest, { deviceId: input.deviceId, role: input.role, pairedAt: Date.now() }],
    updatedAt: Date.now(),
  })
}

export function listPairedPersonalDevices(): PersonalPairingStore['pairedDevices'] {
  return ensureStore().pairedDevices
}

export function resolvePersonalMailboxSession(input: {
  workspaceId: string
  deviceId: string
  identityId?: string
}):
  | {
      ok: true
      data: {
        ok: true
        workspaceId: string
        ownerDeviceId: string
        ownerIdentityId: string
        workspaceKeyB64: string
      }
    }
  | { ok: false; status: number; error: string }
  | null {
  if (!isPersonalSyncWorkspaceId(input.workspaceId)) return null
  const store = ensureStore()
  const expected = personalSyncWorkspaceId(store.identityId)
  if (input.workspaceId !== expected) {
    return { ok: false, status: 403, error: '个人同步工作区与当前账号不匹配' }
  }
  if (input.identityId && input.identityId !== store.identityId) {
    return { ok: false, status: 403, error: '个人同步身份不匹配' }
  }
  rememberPairedDevice({ deviceId: input.deviceId, role: 'mobile' })
  saveWorkspaceKey(expected, store.workspaceKeyB64)
  return {
    ok: true,
    data: {
      ok: true,
      workspaceId: expected,
      ownerDeviceId: store.desktopDeviceId,
      ownerIdentityId: store.identityId,
      workspaceKeyB64: store.workspaceKeyB64,
    },
  }
}

export function getPersonalPairingGrant(): string {
  return ensureStore().grant
}
