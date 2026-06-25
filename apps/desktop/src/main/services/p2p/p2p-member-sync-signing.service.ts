import type { ProductSku } from '@toolman/shared'

import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { signDeviceMessage, verifyDeviceMessage } from './p2p-crypto.service'
import { resolvePeerPublicKey } from './p2p-peer.service'

const MEMBER_SYNC_SIGN_VERSION = 1

export interface SignedMemberJoinedWire {
  v: 2
  type: 'member.joined'
  workspaceId: string
  inviteId?: string
  at: number
  member: {
    id: string
    workspaceId: string
    deviceId: string
    displayName: string
    role: string
    identityId?: string
    subscriptionSku?: ProductSku
  }
  signerDeviceId: string
  signature: string
}

export interface SignedMemberSyncRequestWire {
  v: 2
  type: 'member.sync_request'
  workspaceId: string
  at: number
  signerDeviceId: string
  signature: string
}

function buildMemberSyncRequestSignPayload(input: {
  workspaceId: string
  at: number
}): string {
  return JSON.stringify({
    v: MEMBER_SYNC_SIGN_VERSION,
    type: 'member.sync_request',
    workspaceId: input.workspaceId,
    at: input.at,
  })
}

export function signMemberSyncRequestWireMessage(workspaceId: string): SignedMemberSyncRequestWire {
  const device = getP2pDeviceInfo()
  const at = Date.now()
  const payload = buildMemberSyncRequestSignPayload({ workspaceId, at })
  return {
    v: 2,
    type: 'member.sync_request',
    workspaceId,
    at,
    signerDeviceId: device.deviceId,
    signature: signDeviceMessage(payload),
  }
}

export function verifyMemberSyncRequestWireMessage(
  peerDeviceId: string,
  envelope: SignedMemberSyncRequestWire,
): { ok: true } | { ok: false; reason: string } {
  if (envelope.signerDeviceId !== peerDeviceId) {
    return { ok: false, reason: 'signer device does not match peer' }
  }

  const publicKey = resolvePeerPublicKey(peerDeviceId, peerDeviceId)
  const payload = buildMemberSyncRequestSignPayload({
    workspaceId: envelope.workspaceId,
    at: envelope.at,
  })
  const valid = verifyDeviceMessage(payload, envelope.signature, publicKey)
  if (!valid) {
    return { ok: false, reason: 'invalid member.sync_request signature' }
  }

  return { ok: true }
}

export interface SignedMemberSyncResponseWire {
  v: 2
  type: 'member.sync_response'
  workspaceId: string
  at: number
  member: {
    id: string
    workspaceId: string
    deviceId: string
    displayName: string
    role: string
    identityId?: string
  }
  signerDeviceId: string
  signature: string
}

function buildMemberJoinedSignPayload(input: {
  workspaceId: string
  inviteId?: string
  at: number
  member: SignedMemberJoinedWire['member']
}): string {
  return JSON.stringify({
    v: MEMBER_SYNC_SIGN_VERSION,
    type: 'member.joined',
    workspaceId: input.workspaceId,
    inviteId: input.inviteId ?? null,
    at: input.at,
    member: input.member,
  })
}

function buildMemberSyncResponseSignPayload(input: {
  workspaceId: string
  at: number
  member: SignedMemberSyncResponseWire['member']
}): string {
  return JSON.stringify({
    v: MEMBER_SYNC_SIGN_VERSION,
    type: 'member.sync_response',
    workspaceId: input.workspaceId,
    at: input.at,
    member: input.member,
  })
}

export function signMemberJoinedWireMessage(input: {
  workspaceId: string
  inviteId?: string
  member: SignedMemberJoinedWire['member']
}): SignedMemberJoinedWire {
  const device = getP2pDeviceInfo()
  const at = Date.now()
  const payload = buildMemberJoinedSignPayload({
    workspaceId: input.workspaceId,
    inviteId: input.inviteId,
    at,
    member: input.member,
  })
  return {
    v: 2,
    type: 'member.joined',
    workspaceId: input.workspaceId,
    inviteId: input.inviteId,
    at,
    member: input.member,
    signerDeviceId: device.deviceId,
    signature: signDeviceMessage(payload),
  }
}

export function signMemberSyncResponseWireMessage(input: {
  workspaceId: string
  member: SignedMemberSyncResponseWire['member']
}): SignedMemberSyncResponseWire {
  const device = getP2pDeviceInfo()
  const at = Date.now()
  const payload = buildMemberSyncResponseSignPayload({
    workspaceId: input.workspaceId,
    at,
    member: input.member,
  })
  return {
    v: 2,
    type: 'member.sync_response',
    workspaceId: input.workspaceId,
    at,
    member: input.member,
    signerDeviceId: device.deviceId,
    signature: signDeviceMessage(payload),
  }
}

export function verifyMemberJoinedWireMessage(
  peerDeviceId: string,
  envelope: SignedMemberJoinedWire,
): { ok: true } | { ok: false; reason: string } {
  if (envelope.signerDeviceId !== peerDeviceId) {
    return { ok: false, reason: 'signer device does not match peer' }
  }
  if (envelope.member.deviceId !== peerDeviceId) {
    return { ok: false, reason: 'member device does not match peer' }
  }

  const publicKey = resolvePeerPublicKey(peerDeviceId, peerDeviceId)
  const payload = buildMemberJoinedSignPayload({
    workspaceId: envelope.workspaceId,
    inviteId: envelope.inviteId,
    at: envelope.at,
    member: envelope.member,
  })
  const valid = verifyDeviceMessage(payload, envelope.signature, publicKey)
  if (!valid) {
    return { ok: false, reason: 'invalid member.joined signature' }
  }

  return { ok: true }
}

export function verifyMemberSyncResponseWireMessage(
  peerDeviceId: string,
  envelope: SignedMemberSyncResponseWire,
): { ok: true } | { ok: false; reason: string } {
  if (envelope.signerDeviceId !== peerDeviceId) {
    return { ok: false, reason: 'signer device does not match peer' }
  }
  if (envelope.member.deviceId !== peerDeviceId) {
    return { ok: false, reason: 'member device does not match peer' }
  }

  const publicKey = resolvePeerPublicKey(peerDeviceId, peerDeviceId)
  const payload = buildMemberSyncResponseSignPayload({
    workspaceId: envelope.workspaceId,
    at: envelope.at,
    member: envelope.member,
  })
  const valid = verifyDeviceMessage(payload, envelope.signature, publicKey)
  if (!valid) {
    return { ok: false, reason: 'invalid member.sync_response signature' }
  }

  return { ok: true }
}
