import { eq } from 'drizzle-orm'
import { app } from 'electron'
import os from 'node:os'
import { existsSync } from 'node:fs'
import { identities } from '@toolman/db'
import {
  IdentityProfileSchema,
  IdentityUpdateInputSchema,
  type IdentityProfile,
} from '@toolman/shared'
import { getDatabase } from '../bootstrap/database'
import { getBlobDataUrl, writeBlobFromPath } from './blob.service'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { P2pMemberRepository } from '@toolman/db'

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

function resolveAvatarUrl(avatarHash: string | null | undefined): string | null {
  if (!avatarHash) return null
  try {
    return getBlobDataUrl(avatarHash)
  } catch {
    return null
  }
}

function mapIdentityRow(): IdentityProfile {
  const db = getDatabase()
  const row = db.select().from(identities).where(eq(identities.id, DEFAULT_IDENTITY_ID)).get()
  if (!row) {
    throw new Error('Default identity not found')
  }

  const device = getP2pDeviceInfo()
  return IdentityProfileSchema.parse({
    id: row.id,
    type: row.type,
    displayName: row.displayName,
    publicKey: row.publicKey ?? null,
    avatarUrl: resolveAvatarUrl(row.avatarHash),
    device: {
      deviceId: device.deviceId,
      identityId: device.identityId,
      deviceName: os.hostname(),
      publicKeyFingerprint: device.publicKeyFingerprint,
    },
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export function getIdentityProfile(): IdentityProfile {
  return mapIdentityRow()
}

function syncLocalDisplayNameToP2pMembers(displayName: string): void {
  const device = getP2pDeviceInfo()
  const repo = new P2pMemberRepository(getDatabase())
  for (const membership of repo.listActiveMembershipsByDevice(device.deviceId)) {
    if (membership.displayName === displayName) continue
    repo.update({ id: membership.id, displayName })
  }
}

export function updateIdentityProfile(input: unknown): IdentityProfile {
  const parsed = IdentityUpdateInputSchema.parse(input)
  const db = getDatabase()
  const row = db.select().from(identities).where(eq(identities.id, DEFAULT_IDENTITY_ID)).get()
  if (!row) {
    throw new Error('Default identity not found')
  }

  const now = new Date()
  const nextDisplayName = parsed.displayName?.trim() || row.displayName
  let nextAvatarHash = row.avatarHash

  if (parsed.clearAvatar) {
    nextAvatarHash = null
  } else if (parsed.avatarSourcePath) {
    if (!existsSync(parsed.avatarSourcePath)) {
      throw new Error('Avatar file not found')
    }
    const blob = writeBlobFromPath(parsed.avatarSourcePath)
    if (!blob.mimeType.startsWith('image/')) {
      throw new Error('Avatar must be an image file')
    }
    nextAvatarHash = blob.hash
  }

  db.update(identities)
    .set({
      displayName: nextDisplayName,
      avatarHash: nextAvatarHash,
      updatedAt: now,
    })
    .where(eq(identities.id, DEFAULT_IDENTITY_ID))
    .run()

  if (nextDisplayName !== row.displayName) {
    syncLocalDisplayNameToP2pMembers(nextDisplayName)
  }

  return mapIdentityRow()
}

export function getIdentityAvatarStorageDir(): string {
  return app.getPath('userData')
}
