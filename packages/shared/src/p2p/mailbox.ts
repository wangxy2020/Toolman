import { z } from 'zod'
import {
  decryptP2pChannelPayload,
  decodeWorkspaceKeyB64,
  encryptP2pChannelPayload,
} from './channel-cipher.js'
import { toBufferSource } from './buffer-source.js'
import { RemoteWorkspaceEventWireSchema } from './wire.js'
import { P2pEventTypeSchema, P2pResourceTypeSchema, P2pClientDeviceKindSchema } from './types.js'
import { P2pGroupSyncMemberSchema } from '../sync/p2p-group.js'

export const P2P_MAILBOX_CHANNEL = 'mailbox'
export const P2P_MAILBOX_PUT_PATH = '/api/v1/sync/p2p/mailbox/put'
export const P2P_MAILBOX_PULL_PATH = '/api/v1/sync/p2p/mailbox/pull'
/** Same-user Sync Hub: bootstrap mailbox key for an already-synced group. */
export const P2P_MAILBOX_SESSION_PATH = '/api/v1/sync/p2p/mailbox/session'

export const P2pMailboxSessionInputSchema = z.object({
  workspaceId: z.string().min(1),
  deviceId: z.string().min(1),
  identityId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  deviceKind: P2pClientDeviceKindSchema.optional(),
})
export type P2pMailboxSessionInput = z.infer<typeof P2pMailboxSessionInputSchema>

export const P2pMailboxSharedAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  sessionIds: z.array(z.string().min(1)),
  sessionTitles: z.record(z.string()).optional(),
  sessionPermissions: z.record(z.enum(['read', 'callable'])).optional(),
  sharedBy: z.string().min(1).optional(),
  ownerDeviceId: z.string().min(1).optional(),
  referencedModelId: z.string().min(1).optional(),
})
export type P2pMailboxSharedAgent = z.infer<typeof P2pMailboxSharedAgentSchema>

export const P2pMailboxSessionOutputSchema = z.object({
  ok: z.literal(true),
  workspaceId: z.string().min(1),
  ownerDeviceId: z.string().min(1),
  ownerIdentityId: z.string().min(1).optional(),
  workspaceKeyB64: z.string().min(1),
  members: z.array(P2pGroupSyncMemberSchema).optional(),
  sharedAgents: z.array(P2pMailboxSharedAgentSchema).optional(),
})
export type P2pMailboxSessionOutput = z.infer<typeof P2pMailboxSessionOutputSchema>

export const P2pMailboxProposeSchema = z.object({
  resourceType: P2pResourceTypeSchema,
  resourceId: z.string().min(1),
  operatorId: z.string().min(1),
  eventType: P2pEventTypeSchema,
  payload: z.record(z.unknown()),
  sourceDeviceId: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
})
export type P2pMailboxPropose = z.infer<typeof P2pMailboxProposeSchema>

export const P2pMailboxPlaintextSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('workspace.event'),
    event: RemoteWorkspaceEventWireSchema,
  }),
  z.object({
    type: z.literal('workspace.propose'),
    proposal: P2pMailboxProposeSchema,
  }),
  z.object({
    type: z.literal('agent-relay.message'),
    senderDeviceId: z.string().min(1),
    relay: z.unknown(),
  }),
  z.object({
    type: z.literal('device.sync.changes'),
    senderDeviceId: z.string().min(1),
    changes: z.array(z.unknown()).max(500),
    depositedAt: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('device.sync.signal'),
    senderDeviceId: z.string().min(1),
    kind: z.enum(['offer', 'answer', 'ice']),
    payload: z.record(z.unknown()),
    depositedAt: z.number().int().nonnegative(),
  }),
])
export type P2pMailboxPlaintext = z.infer<typeof P2pMailboxPlaintextSchema>

export const P2pMailboxPutInputSchema = z.object({
  workspaceId: z.string().min(1),
  deviceId: z.string().min(1),
  recipientDeviceId: z.string().min(1),
  grant: z.string().min(16),
  ciphertextB64: z.string().min(16),
  seq: z.number().int().nonnegative().optional(),
  inviteToken: z.string().min(1).optional(),
})
export type P2pMailboxPutInput = z.infer<typeof P2pMailboxPutInputSchema>

export const P2pMailboxPutOutputSchema = z.object({
  ok: z.literal(true),
  stored: z.boolean(),
})
export type P2pMailboxPutOutput = z.infer<typeof P2pMailboxPutOutputSchema>

export const P2pMailboxPullInputSchema = z.object({
  workspaceId: z.string().min(1),
  deviceId: z.string().min(1),
  grant: z.string().min(16),
  sinceSeq: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(200).optional(),
  inviteToken: z.string().min(1).optional(),
})
export type P2pMailboxPullInput = z.infer<typeof P2pMailboxPullInputSchema>

export const P2pMailboxEnvelopeSchema = z.object({
  seq: z.number().int().nonnegative(),
  ciphertextB64: z.string().min(16),
  depositedAt: z.number().int().nonnegative(),
})
export type P2pMailboxEnvelope = z.infer<typeof P2pMailboxEnvelopeSchema>

export const P2pMailboxPullOutputSchema = z.object({
  ok: z.literal(true),
  envelopes: z.array(P2pMailboxEnvelopeSchema),
  members: z.array(P2pGroupSyncMemberSchema).optional(),
  ownerIdentityId: z.string().min(1).optional(),
  ownerDeviceId: z.string().min(1).optional(),
  sharedAgents: z.array(P2pMailboxSharedAgentSchema).optional(),
})
export type P2pMailboxPullOutput = z.infer<typeof P2pMailboxPullOutputSchema>

function bytesToB64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary)
}

function b64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'))
  const binary = globalThis.atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildMailboxGrant(input: {
  workspaceKey: Uint8Array
  workspaceId: string
  deviceId: string
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    toBufferSource(input.workspaceKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`toolman-p2p-mailbox:${input.workspaceId}:${input.deviceId}`),
  )
  return bytesToB64(new Uint8Array(sig))
}

export async function hashMailboxGrant(grant: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(grant))
  return bytesToHex(new Uint8Array(digest))
}

export async function grantsMatch(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([hashMailboxGrant(left), hashMailboxGrant(right)])
  return a === b
}

export async function sealMailboxPlaintext(input: {
  workspaceKey: Uint8Array
  workspaceId: string
  plaintext: P2pMailboxPlaintext
}): Promise<string> {
  const envelope = await encryptP2pChannelPayload({
    workspaceKey: input.workspaceKey,
    workspaceId: input.workspaceId,
    channel: P2P_MAILBOX_CHANNEL,
    plaintext: new TextEncoder().encode(JSON.stringify(input.plaintext)),
  })
  return bytesToB64(envelope)
}

export async function openMailboxPlaintext(input: {
  workspaceKey: Uint8Array
  workspaceId: string
  ciphertextB64: string
}): Promise<P2pMailboxPlaintext> {
  const plain = await decryptP2pChannelPayload({
    workspaceKey: input.workspaceKey,
    workspaceId: input.workspaceId,
    channel: P2P_MAILBOX_CHANNEL,
    envelope: b64ToBytes(input.ciphertextB64),
  })
  return P2pMailboxPlaintextSchema.parse(JSON.parse(new TextDecoder().decode(plain)))
}

export function workspaceKeyFromB64(workspaceKeyB64: string): Uint8Array {
  return decodeWorkspaceKeyB64(workspaceKeyB64)
}
