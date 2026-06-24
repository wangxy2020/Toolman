import { eq } from 'drizzle-orm'
import { app } from 'electron'
import {
  AuthSessionRepository,
  createP2pDeviceIdentityRepository,
  identities,
} from '@toolman/db'
import type { P2pDeviceGetInfoOutput } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getLocalIdentityId } from '../local-identity'
import { P2pBridge, type NativeDeviceInfo } from './p2p-bridge'

let cachedDeviceInfo: P2pDeviceGetInfoOutput | null = null

function resolveIdentityIdForDevice(): string {
  const localIdentityId = getLocalIdentityId()
  // Read auth session directly — do not call getAuthSession(), which loads
  // getIdentityProfile() → getP2pDeviceInfo() and would recurse infinitely.
  try {
    const sessionRepo = new AuthSessionRepository(getDatabase())
    const session = sessionRepo.ensureCurrent(localIdentityId)
    return session.identityId ?? localIdentityId
  } catch {
    return localIdentityId
  }
}

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
    .where(eq(identities.id, getLocalIdentityId()))
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

function bootstrapNativeDevice(): P2pDeviceGetInfoOutput {
  const userData = app.getPath('userData')
  let native: NativeDeviceInfo
  try {
    native = P2pBridge.deviceIdentityGetInfo()
  } catch {
    native = P2pBridge.deviceIdentityEnsure(userData)
  }

  const info = mapNativeDeviceInfo(native, resolveIdentityIdForDevice())
  syncDeviceIdentityRow(info)
  syncIdentityPublicKey(info.publicKey)
  cachedDeviceInfo = info
  return info
}

export function bindP2pDeviceToIdentity(identityId?: string): P2pDeviceGetInfoOutput {
  const resolvedIdentityId = identityId ?? resolveIdentityIdForDevice()
  const current = cachedDeviceInfo ?? bootstrapNativeDevice()
  if (current.identityId === resolvedIdentityId) {
    return current
  }

  const updated: P2pDeviceGetInfoOutput = {
    ...current,
    identityId: resolvedIdentityId,
  }
  syncDeviceIdentityRow(updated)
  cachedDeviceInfo = updated
  return updated
}

export function ensureP2pDeviceIdentity(): P2pDeviceGetInfoOutput {
  return bindP2pDeviceToIdentity()
}

export function refreshP2pDeviceIdentityBinding(): P2pDeviceGetInfoOutput {
  return bindP2pDeviceToIdentity(resolveIdentityIdForDevice())
}

export function getP2pDeviceInfo(): P2pDeviceGetInfoOutput {
  return bindP2pDeviceToIdentity()
}

export function getP2pDeviceId(): string {
  return getP2pDeviceInfo().deviceId
}

export function getP2pPublicKeyFingerprint(): string {
  return getP2pDeviceInfo().publicKeyFingerprint
}

export function resetP2pDeviceIdentityCacheForTests(): void {
  cachedDeviceInfo = null
}
