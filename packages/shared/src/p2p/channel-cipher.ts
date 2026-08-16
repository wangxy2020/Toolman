import { toBufferSource } from './buffer-source.js'

const WORKSPACE_KEY_LEN = 32
const NONCE_LEN = 12
const TAG_LEN = 16
const ENVELOPE_MAGIC = new Uint8Array([0x54, 0x4d]) // TM
const ENVELOPE_VERSION = 1
const ENVELOPE_HEADER_LEN = 2 + 1 + 4 + NONCE_LEN

export const P2P_HANDSHAKE_PING = new TextEncoder().encode('toolman-p2p-ping')
export const P2P_HANDSHAKE_PONG = new TextEncoder().encode('toolman-p2p-pong')
export const P2P_EVENTS_CHANNEL = 'events'
export const P2P_FILES_CHANNEL = 'files'

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function u32le(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

function readU32le(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true)
}

export function decodeWorkspaceKeyB64(workspaceKeyB64: string): Uint8Array {
  const normalized = workspaceKeyB64.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const bytes =
    typeof Buffer !== 'undefined'
      ? new Uint8Array(Buffer.from(padded, 'base64'))
      : Uint8Array.from(globalThis.atob(padded), (char) => char.charCodeAt(0))
  if (bytes.length !== WORKSPACE_KEY_LEN) {
    throw new Error(`workspace key must be ${WORKSPACE_KEY_LEN} bytes`)
  }
  return bytes
}

async function deriveAesKey(
  workspaceKey: Uint8Array,
  workspaceId: string,
  channel: string,
  keyVersion: number,
) {
  const ikm = await crypto.subtle.importKey('raw', toBufferSource(workspaceKey), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(workspaceId),
      info: new TextEncoder().encode(`toolman-p2p:${channel}:v${keyVersion}`),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptP2pChannelPayload(input: {
  workspaceKey: Uint8Array
  workspaceId: string
  channel: string
  keyVersion?: number
  plaintext: Uint8Array
}): Promise<Uint8Array> {
  const keyVersion = input.keyVersion ?? 1
  const key = await deriveAesKey(input.workspaceKey, input.workspaceId, input.channel, keyVersion)
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, toBufferSource(input.plaintext)),
  )
  return concatBytes(ENVELOPE_MAGIC, new Uint8Array([ENVELOPE_VERSION]), u32le(keyVersion), nonce, sealed)
}

export async function decryptP2pChannelPayload(input: {
  workspaceKey: Uint8Array
  workspaceId: string
  channel: string
  envelope: Uint8Array
}): Promise<Uint8Array> {
  if (input.envelope.length < ENVELOPE_HEADER_LEN + TAG_LEN) {
    throw new Error('Encrypted envelope too short')
  }
  if (input.envelope[0] !== ENVELOPE_MAGIC[0] || input.envelope[1] !== ENVELOPE_MAGIC[1]) {
    throw new Error('Invalid encrypted envelope magic')
  }
  if (input.envelope[2] !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version ${input.envelope[2]}`)
  }
  const keyVersion = readU32le(input.envelope, 3)
  const nonce = input.envelope.slice(7, 7 + NONCE_LEN)
  const ciphertext = input.envelope.slice(ENVELOPE_HEADER_LEN)
  const key = await deriveAesKey(input.workspaceKey, input.workspaceId, input.channel, keyVersion)
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, toBufferSource(ciphertext)),
  )
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!
  return diff === 0
}
