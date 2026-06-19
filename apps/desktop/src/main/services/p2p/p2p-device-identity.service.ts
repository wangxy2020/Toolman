import { eq } from 'drizzle-orm'
import { app } from 'electron'
import { createP2pDeviceIdentityRepository, identities } from '@toolman/db'
import type { P2pDeviceGetInfoOutput } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge, type NativeDeviceInfo } from './p2p-bridge'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

let cachedDeviceInfo: P2pDeviceGetInfoOutput | null = null

function mapNativeDeviceInfo(native: NativeDeviceInfo, identityId: string): P2pDeviceGetInfoOutput {
  return {
    deviceId: native.deviceId,
    identityId,
    publicKey: native.publicKey,
    publicKeyFingerprint: native.publicKeyFingerprint,
    privateKeyRef: native.privateKeyRef,
    createdAt: native.createdAt,
  }
}

function syncIdentityPublicKey(publicKey: string): void {
  const db = getDatabase()
  const now = new Date()
  db.update(identities)
    .set({
      publicKey,
      updatedAt: now,
    })
    .where(eq(identities.id, DEFAULT_IDENTITY_ID))
    .run()
}

function syncDeviceIdentityRow(info: P2pDeviceGetInfoOutput): void {
  const repo = createP2pDeviceIdentityRepository(getDatabase())
  repo.upsert({
    deviceId: info.deviceId,
    identityId: info.identityId,
    publicKey: info.publicKey,
    privateKeyRef: info.privateKeyRef,
    createdAt: new Date(info.createdAt),
  })
}

export function ensureP2pDeviceIdentity(): P2pDeviceGetInfoOutput {
  if (cachedDeviceInfo) return cachedDeviceInfo

  const userData = app.getPath('userData')
  const native = P2pBridge.deviceIdentityEnsure(userData)
  const info = mapNativeDeviceInfo(native, DEFAULT_IDENTITY_ID)

  syncDeviceIdentityRow(info)
  syncIdentityPublicKey(info.publicKey)

  cachedDeviceInfo = info
  return info
}

export function getP2pDeviceInfo(): P2pDeviceGetInfoOutput {
  if (cachedDeviceInfo) return cachedDeviceInfo

  try {
    const native = P2pBridge.deviceIdentityGetInfo()
    const info = mapNativeDeviceInfo(native, DEFAULT_IDENTITY_ID)
    cachedDeviceInfo = info
    return info
  } catch {
    return ensureP2pDeviceIdentity()
  }
}

export function getP2pDeviceId(): string {
  return getP2pDeviceInfo().deviceId
}

export function getP2pPublicKeyFingerprint(): string {
  return getP2pDeviceInfo().publicKeyFingerprint
}
