import {
  buildCidManifestSignedPayload,
  deriveDidFromPublicKeyB64,
  verifyDidMatchesPublicKey,
  type CidPackageManifest,
  type CidWireAnnounce,
  type CidWireChunkResponse,
} from '@toolman/shared'
import { buildCidChunkSignedPayload } from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { getP2pDeviceInfo } from '../p2p/p2p-device-identity.service'
import { signDeviceMessage, verifyDeviceMessage } from '../p2p/p2p-crypto.service'

let verifyFailures = 0

export function getCommunityCidSigningStats() {
  return { verifyFailures }
}

export function signCidPackageManifest(manifest: CidPackageManifest): CidPackageManifest {
  const device = getP2pDeviceInfo()
  const signerDid = deriveDidFromPublicKeyB64(device.publicKey)
  const at = Date.now()
  const payload = buildCidManifestSignedPayload(manifest)
  const signature = signDeviceMessage(payload)

  return {
    ...manifest,
    signerDid,
    publicKey: device.publicKey,
    deviceId: device.deviceId,
    at,
    signature,
  }
}

export function verifyCidPackageManifest(manifest: CidPackageManifest): boolean {
  if (!manifest.signature || !manifest.signerDid || !manifest.publicKey || !manifest.deviceId || !manifest.at) {
    verifyFailures += 1
    return false
  }

  if (!verifyDidMatchesPublicKey(manifest.signerDid, manifest.publicKey)) {
    verifyFailures += 1
    return false
  }

  const payload = buildCidManifestSignedPayload(manifest)
  const valid = verifyDeviceMessage(payload, manifest.signature, manifest.publicKey)
  if (!valid) {
    verifyFailures += 1
    recordDiagnosticEvent('community-cid', 'warn', `manifest verify failed for ${manifest.rootCid}`)
  }
  return valid
}

export function signCidWireAnnounce(manifest: CidPackageManifest): CidWireAnnounce {
  const signedManifest = signCidPackageManifest(manifest)

  return {
    v: 1,
    manifest: signedManifest,
    signerDid: signedManifest.signerDid!,
    publicKey: signedManifest.publicKey!,
    deviceId: signedManifest.deviceId!,
    at: signedManifest.at!,
    signature: signedManifest.signature!,
  }
}

export function verifyCidWireAnnounce(announce: CidWireAnnounce): boolean {
  if (!verifyDidMatchesPublicKey(announce.signerDid, announce.publicKey)) {
    verifyFailures += 1
    return false
  }

  const payload = buildCidManifestSignedPayload(announce.manifest)
  const valid =
    verifyDeviceMessage(payload, announce.signature, announce.publicKey) &&
    verifyCidPackageManifest(announce.manifest)

  if (!valid) {
    verifyFailures += 1
  }
  return valid
}

export function signCidChunkResponse(input: {
  requestId: string
  rootCid: string
  chunkIndex: number
  chunkCid: string
  data: Buffer
}): CidWireChunkResponse {
  const device = getP2pDeviceInfo()
  const signerDid = deriveDidFromPublicKeyB64(device.publicKey)
  const at = Date.now()
  const dataB64 = input.data.toString('base64')
  const payload = buildCidChunkSignedPayload({
    rootCid: input.rootCid,
    chunkIndex: input.chunkIndex,
    chunkCid: input.chunkCid,
    data: dataB64,
    signerDid,
    publicKey: device.publicKey,
    deviceId: device.deviceId,
    at,
  })

  return {
    v: 1,
    requestId: input.requestId,
    rootCid: input.rootCid,
    chunkIndex: input.chunkIndex,
    chunkCid: input.chunkCid,
    data: dataB64,
    signerDid,
    publicKey: device.publicKey,
    deviceId: device.deviceId,
    at,
    signature: signDeviceMessage(payload),
  }
}

export function verifyCidChunkResponse(response: CidWireChunkResponse): boolean {
  if (!verifyDidMatchesPublicKey(response.signerDid, response.publicKey)) {
    verifyFailures += 1
    return false
  }

  const payload = buildCidChunkSignedPayload({
    rootCid: response.rootCid,
    chunkIndex: response.chunkIndex,
    chunkCid: response.chunkCid,
    data: response.data,
    signerDid: response.signerDid,
    publicKey: response.publicKey,
    deviceId: response.deviceId,
    at: response.at,
  })

  const valid = verifyDeviceMessage(payload, response.signature, response.publicKey)
  if (!valid) {
    verifyFailures += 1
  }
  return valid
}
