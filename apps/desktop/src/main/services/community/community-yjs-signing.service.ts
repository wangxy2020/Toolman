import {
  buildCommunityYjsSignedUpdatePayload,
  deriveDidFromPublicKeyB64,
  verifyDidMatchesPublicKey,
  type CommunityYjsSignedWireMessage,
} from '@toolman/shared'
import { createHash } from 'node:crypto'

import { recordDiagnosticEvent } from '../diagnostics-log'
import { checkReplayGuard } from '../p2p/p2p-replay-guard.service'
import { getP2pDeviceInfo } from '../p2p/p2p-device-identity.service'
import { signDeviceMessage, verifyDeviceMessage } from '../p2p/p2p-crypto.service'
import { isDidBlocked } from './community-federated-trust.service'

let acceptedSignedUpdates = 0
let rejectedUnsignedUpdates = 0
let verifyFailures = 0

export function getCommunityYjsSigningStats() {
  return {
    acceptedSignedUpdates,
    rejectedUnsignedUpdates,
    verifyFailures,
  }
}

export function getLocalCommunityDid(): string | null {
  try {
    const device = getP2pDeviceInfo()
    return deriveDidFromPublicKeyB64(device.publicKey)
  } catch {
    return null
  }
}

export function signCommunityYjsWireMessage(input: {
  domain: CommunityYjsSignedWireMessage['domain']
  update: string
  originPeerId?: string
  at: number
}): CommunityYjsSignedWireMessage {
  const device = getP2pDeviceInfo()
  const signerDid = deriveDidFromPublicKeyB64(device.publicKey)
  const payload = buildCommunityYjsSignedUpdatePayload({
    domain: input.domain,
    update: input.update,
    signerDid,
    publicKey: device.publicKey,
    deviceId: device.deviceId,
    at: input.at,
  })

  return {
    v: 2,
    domain: input.domain,
    update: input.update,
    signerDid,
    publicKey: device.publicKey,
    deviceId: device.deviceId,
    originPeerId: input.originPeerId,
    at: input.at,
    signature: signDeviceMessage(payload),
  }
}

export type CommunityYjsVerifyResult =
  | { ok: true; message: CommunityYjsSignedWireMessage }
  | { ok: false; reason: string }

export function verifyCommunityYjsSignedWireMessage(
  message: CommunityYjsSignedWireMessage,
): CommunityYjsVerifyResult {
  if (!verifyDidMatchesPublicKey(message.signerDid, message.publicKey)) {
    verifyFailures += 1
    return { ok: false, reason: 'signer DID does not match public key' }
  }

  if (isDidBlocked(message.signerDid)) {
    verifyFailures += 1
    return { ok: false, reason: 'signer DID is blocked' }
  }

  const payload = buildCommunityYjsSignedUpdatePayload({
    domain: message.domain,
    update: message.update,
    signerDid: message.signerDid,
    publicKey: message.publicKey,
    deviceId: message.deviceId,
    at: message.at,
  })

  const valid = verifyDeviceMessage(payload, message.signature, message.publicKey)
  if (!valid) {
    verifyFailures += 1
    recordDiagnosticEvent(
      'community-yjs',
      'warn',
      `signature verify failed for ${message.signerDid}`,
    )
    return { ok: false, reason: 'invalid signature' }
  }

  const replay = checkReplayGuard({
    scope: `community-yjs:${message.domain}`,
    signerId: message.signerDid,
    at: message.at,
    payloadHash: createHash('sha256').update(message.update).digest('hex'),
  })
  if (!replay.ok) {
    verifyFailures += 1
    return { ok: false, reason: replay.reason }
  }

  acceptedSignedUpdates += 1
  return { ok: true, message }
}

export function recordRejectedUnsignedCommunityUpdate(): void {
  rejectedUnsignedUpdates += 1
}
