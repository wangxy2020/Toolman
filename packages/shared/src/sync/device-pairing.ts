import { z } from 'zod'
import { SyncChangeSchema } from './types.js'

/** Personal sync mailbox namespace (not a group workspace). */
export const PERSONAL_SYNC_WORKSPACE_PREFIX = 'psync:'

export function personalSyncWorkspaceId(identityId: string): string {
  const id = identityId.trim()
  if (!id) throw new Error('identityId required')
  return `${PERSONAL_SYNC_WORKSPACE_PREFIX}${id}`
}

export function isPersonalSyncWorkspaceId(workspaceId: string): boolean {
  return workspaceId.startsWith(PERSONAL_SYNC_WORKSPACE_PREFIX)
}

export const DevicePairingOfferSchema = z.object({
  v: z.literal(1),
  /** Same Authing/Firebase-resolved bucket id on both ends. */
  identityId: z.string().min(1),
  desktopDeviceId: z.string().min(1),
  /** AES workspace key (base64) for personal mailbox encryption. */
  workspaceKeyB64: z.string().min(16),
  /** Mailbox grant shared with paired mobile/web devices. */
  grant: z.string().min(16),
  /** Optional LAN Sync Hub URL hint (may be unreachable from hosted web). */
  hubBaseUrlHint: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
})
export type DevicePairingOffer = z.infer<typeof DevicePairingOfferSchema>

export const DevicePairingRecordSchema = z.object({
  identityId: z.string().min(1),
  peerDeviceId: z.string().min(1),
  localDeviceId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceKeyB64: z.string().min(16),
  grant: z.string().min(16),
  hubBaseUrlHint: z.string().optional(),
  pairedAt: z.number().int().nonnegative(),
  role: z.enum(['mobile', 'web', 'desktop']),
})
export type DevicePairingRecord = z.infer<typeof DevicePairingRecordSchema>

export const DeviceSyncTransportSchema = z.enum([
  'lan-hub',
  'webrtc',
  'personal-mailbox',
  'device-sync-optional',
  'none',
])
export type DeviceSyncTransport = z.infer<typeof DeviceSyncTransportSchema>

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return globalThis.btoa(binary)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function utf8ToBase64Url(text: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8').toString('base64url')
  const bytes = new TextEncoder().encode(text)
  return bytesToBase64Url(bytes)
}

function base64UrlToUtf8(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64').toString('utf8')
  const binary = globalThis.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  globalThis.crypto.getRandomValues(out)
  return out
}

export function createDevicePairingSecrets(): {
  workspaceKeyB64: string
  grant: string
} {
  return {
    workspaceKeyB64: bytesToBase64(randomBytes(32)),
    grant: bytesToBase64Url(randomBytes(24)),
  }
}

export function encodeDevicePairingOffer(offer: DevicePairingOffer): string {
  const json = JSON.stringify(DevicePairingOfferSchema.parse(offer))
  return `tm1.${utf8ToBase64Url(json)}`
}

export function decodeDevicePairingOffer(raw: string): DevicePairingOffer {
  const trimmed = raw.trim()
  const body = trimmed.startsWith('tm1.') ? trimmed.slice(4) : trimmed
  const json = base64UrlToUtf8(body)
  const offer = DevicePairingOfferSchema.parse(JSON.parse(json) as unknown)
  if (offer.expiresAt < Date.now()) {
    throw new Error('设备配对码已过期，请在桌面端重新生成')
  }
  return offer
}

export function pairingRecordFromOffer(input: {
  offer: DevicePairingOffer
  localDeviceId: string
  role: DevicePairingRecord['role']
}): DevicePairingRecord {
  const { offer, localDeviceId, role } = input
  return DevicePairingRecordSchema.parse({
    identityId: offer.identityId,
    peerDeviceId: offer.desktopDeviceId,
    localDeviceId,
    workspaceId: personalSyncWorkspaceId(offer.identityId),
    workspaceKeyB64: offer.workspaceKeyB64,
    grant: offer.grant,
    hubBaseUrlHint: offer.hubBaseUrlHint,
    pairedAt: Date.now(),
    role,
  })
}

/** Stable short fingerprint for UI (not secret). */
export function pairingFingerprint(grant: string): string {
  let hash = 0
  for (let i = 0; i < grant.length; i += 1) {
    hash = (hash * 31 + grant.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export const DeviceSyncMailboxPlaintextSchema = z.object({
  type: z.literal('device.sync.changes'),
  senderDeviceId: z.string().min(1),
  changes: z.array(SyncChangeSchema).max(500),
  depositedAt: z.number().int().nonnegative(),
})
export type DeviceSyncMailboxPlaintext = z.infer<typeof DeviceSyncMailboxPlaintextSchema>

export const DeviceSyncSignalPlaintextSchema = z.object({
  type: z.literal('device.sync.signal'),
  senderDeviceId: z.string().min(1),
  kind: z.enum(['offer', 'answer', 'ice']),
  payload: z.record(z.unknown()),
  depositedAt: z.number().int().nonnegative(),
})
export type DeviceSyncSignalPlaintext = z.infer<typeof DeviceSyncSignalPlaintextSchema>

/** WebRTC DataChannel label for personal device sync. */
export const DEVICE_SYNC_DATA_CHANNEL = 'device-sync'

export const DeviceSyncChannelMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sync.hello'),
    senderDeviceId: z.string().min(1),
  }),
  z.object({
    type: z.literal('sync.pull'),
    senderDeviceId: z.string().min(1),
    cursor: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('sync.changes'),
    senderDeviceId: z.string().min(1),
    changes: z.array(SyncChangeSchema).max(500),
  }),
])
export type DeviceSyncChannelMessage = z.infer<typeof DeviceSyncChannelMessageSchema>
