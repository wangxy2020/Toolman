import { base58Encode } from '../utils/base58.js'
import { decodeBase64ToBytes } from '../utils/sha256-bytes.js'
import { sha256HexFromBytes } from '../utils/sha256-hex.js'

export const TOOLMAN_DID_PREFIX = 'did:toolman:v1:'

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function deriveDidFromPublicKeyB64(publicKeyB64: string): string {
  const keyBytes = decodeBase64ToBytes(publicKeyB64.trim())
  const hashHex = sha256HexFromBytes(keyBytes)
  return `${TOOLMAN_DID_PREFIX}${base58Encode(hexToBytes(hashHex))}`
}

export function isToolmanDid(value: string): boolean {
  return value.startsWith(TOOLMAN_DID_PREFIX) && value.length > TOOLMAN_DID_PREFIX.length
}

export function verifyDidMatchesPublicKey(did: string, publicKeyB64: string): boolean {
  if (!isToolmanDid(did)) return false
  try {
    return deriveDidFromPublicKeyB64(publicKeyB64) === did
  } catch {
    return false
  }
}

export function truncateDid(did: string, head = 18, tail = 6): string {
  if (did.length <= head + tail + 1) return did
  return `${did.slice(0, head)}…${did.slice(-tail)}`
}
