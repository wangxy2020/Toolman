import { toBufferSource } from './buffer-source.js'
import {
  WAN_COMPRESSED_PAYLOAD_PREFIX,
  WAN_RAW_PAYLOAD_PREFIX,
} from './invite-url.js'

export type WanInviteBundle = {
  t: string
  d: string
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'))
  }
  const binary = globalThis.atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function utf8FromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'function') {
    const stream = new Blob([toBufferSource(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  const zlib = await import('node:zlib')
  return new Uint8Array(zlib.gunzipSync(Buffer.from(bytes)))
}

export async function decodeWanBlobBytes(encoded: string): Promise<Uint8Array> {
  const trimmed = encoded.trim()
  if (trimmed.startsWith(WAN_COMPRESSED_PAYLOAD_PREFIX)) {
    return gunzipBytes(decodeBase64Url(trimmed.slice(WAN_COMPRESSED_PAYLOAD_PREFIX.length)))
  }
  if (trimmed.startsWith(WAN_RAW_PAYLOAD_PREFIX)) {
    return decodeBase64Url(trimmed.slice(WAN_RAW_PAYLOAD_PREFIX.length))
  }
  if (trimmed.startsWith('v=0')) {
    return new TextEncoder().encode(trimmed)
  }
  return decodeBase64Url(trimmed)
}

export async function unpackWanInviteBundle(encoded: string): Promise<WanInviteBundle> {
  const json = utf8FromBytes(await decodeWanBlobBytes(encoded))
  const parsed = JSON.parse(json) as Partial<WanInviteBundle>
  if (!parsed.t?.trim() || !parsed.d?.trim()) {
    throw new Error('无效的广域网邀请包')
  }
  return { t: parsed.t, d: parsed.d }
}
