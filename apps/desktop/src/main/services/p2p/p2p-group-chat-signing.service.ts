import { createHash } from 'node:crypto'

import {
  buildGroupChatClearSignPayload,
  buildGroupChatMessageSignPayload,
  type P2pGroupChatMessage,
} from '@toolman/shared'

import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { signDeviceMessage, verifyDeviceMessage } from './p2p-crypto.service'
import { resolvePeerPublicKey } from './p2p-peer.service'

export interface SignedGroupChatWireEnvelope {
  v: 2
  type: 'group-chat.message'
  message: P2pGroupChatMessage
  signerDeviceId: string
  signature: string
}

function hashContentBlocks(message: P2pGroupChatMessage): string {
  return createHash('sha256').update(JSON.stringify(message.contentBlocks)).digest('hex')
}

export function buildGroupChatMessageSignPayloadForDevice(message: P2pGroupChatMessage): string {
  return buildGroupChatMessageSignPayload(message, hashContentBlocks(message))
}

export function signGroupChatWireMessage(message: P2pGroupChatMessage): SignedGroupChatWireEnvelope {
  const device = getP2pDeviceInfo()
  const payload = buildGroupChatMessageSignPayloadForDevice(message)
  return {
    v: 2,
    type: 'group-chat.message',
    message,
    signerDeviceId: device.deviceId,
    signature: signDeviceMessage(payload),
  }
}

export function verifyGroupChatWireMessage(
  peerDeviceId: string,
  envelope: SignedGroupChatWireEnvelope,
): { ok: true } | { ok: false; reason: string } {
  if (envelope.signerDeviceId !== peerDeviceId) {
    return { ok: false, reason: 'signer device does not match peer' }
  }

  const memberDeviceMismatch = envelope.message.senderMemberId.trim().length === 0
  if (memberDeviceMismatch) {
    return { ok: false, reason: 'missing sender member id' }
  }

  const publicKey = resolvePeerPublicKey(peerDeviceId, peerDeviceId)
  const payload = buildGroupChatMessageSignPayloadForDevice(envelope.message)
  const valid = verifyDeviceMessage(payload, envelope.signature, publicKey)
  if (!valid) {
    return { ok: false, reason: 'invalid group chat signature' }
  }

  return { ok: true }
}

export interface SignedGroupChatClearWireEnvelope {
  v: 2
  type: 'group-chat.clear'
  workspaceId: string
  clearedAt: number
  signerDeviceId: string
  signature: string
}

export function signGroupChatClearWireMessage(workspaceId: string): SignedGroupChatClearWireEnvelope {
  const device = getP2pDeviceInfo()
  const clearedAt = Date.now()
  const payload = buildGroupChatClearSignPayload({ workspaceId, clearedAt })
  return {
    v: 2,
    type: 'group-chat.clear',
    workspaceId,
    clearedAt,
    signerDeviceId: device.deviceId,
    signature: signDeviceMessage(payload),
  }
}

export function verifyGroupChatClearWireMessage(
  peerDeviceId: string,
  envelope: SignedGroupChatClearWireEnvelope,
): { ok: true } | { ok: false; reason: string } {
  if (envelope.signerDeviceId !== peerDeviceId) {
    return { ok: false, reason: 'signer device does not match peer' }
  }

  const publicKey = resolvePeerPublicKey(peerDeviceId, peerDeviceId)
  const payload = buildGroupChatClearSignPayload({
    workspaceId: envelope.workspaceId,
    clearedAt: envelope.clearedAt,
  })
  const valid = verifyDeviceMessage(payload, envelope.signature, publicKey)
  if (!valid) {
    return { ok: false, reason: 'invalid group chat clear signature' }
  }

  return { ok: true }
}
