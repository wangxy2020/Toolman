import {
  buildFederatedCatalogSignedPayload,
  deriveDidFromPublicKeyB64,
  verifyDidMatchesPublicKey,
  type FederatedCatalogWireMessage,
  type FederatedResourceCatalogEntry,
} from '@toolman/shared'

import { recordDiagnosticEvent } from '../diagnostics-log'
import { getP2pDeviceInfo } from '../p2p/p2p-device-identity.service'
import { signDeviceMessage, verifyDeviceMessage } from '../p2p/p2p-crypto.service'
import { isDidBlocked } from './community-federated-trust.service'

let verifyFailures = 0

export function getCommunityFederationSigningStats() {
  return { verifyFailures }
}

export function signFederatedCatalogWireMessage(
  entry: FederatedResourceCatalogEntry,
): FederatedCatalogWireMessage {
  const device = getP2pDeviceInfo()
  const signerDid = deriveDidFromPublicKeyB64(device.publicKey)
  const at = Date.now()
  const payload = buildFederatedCatalogSignedPayload(entry)
  const signature = signDeviceMessage(payload)

  return {
    v: 1,
    entry,
    signerDid,
    publicKey: device.publicKey,
    deviceId: device.deviceId,
    at,
    signature,
  }
}

export function verifyFederatedCatalogWireMessage(message: FederatedCatalogWireMessage): boolean {
  if (isDidBlocked(message.signerDid)) {
    verifyFailures += 1
    return false
  }

  if (!verifyDidMatchesPublicKey(message.signerDid, message.publicKey)) {
    verifyFailures += 1
    return false
  }

  const payload = buildFederatedCatalogSignedPayload(message.entry)
  const valid = verifyDeviceMessage(payload, message.signature, message.publicKey)
  if (!valid) {
    verifyFailures += 1
    recordDiagnosticEvent(
      'community-federation',
      'warn',
      `catalog verify failed for ${message.entry.id}`,
    )
  }
  return valid
}
