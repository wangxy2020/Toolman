import { sha256Hex } from '../utils/sha256-hex.js'

export const TOOLMAN_CID_PREFIX = 'toolman:sha256:'

const SHA256_HEX_RE = /^[a-f0-9]{64}$/i

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_RE.test(value)
}

export function cidFromSha256Hex(digestHex: string): string {
  const normalized = digestHex.trim().toLowerCase()
  if (!isSha256Hex(normalized)) {
    throw new Error('Invalid SHA-256 hex digest')
  }
  return `${TOOLMAN_CID_PREFIX}${normalized}`
}

export function parseToolmanCid(cid: string): { digestHex: string } | null {
  if (!cid.startsWith(TOOLMAN_CID_PREFIX)) return null
  const digestHex = cid.slice(TOOLMAN_CID_PREFIX.length).toLowerCase()
  if (!isSha256Hex(digestHex)) return null
  return { digestHex }
}

export function isToolmanCid(value: string): boolean {
  return parseToolmanCid(value) != null
}

export function computeRootCidFromChunkCids(chunkCids: string[]): string {
  const payload = chunkCids.join('\n')
  return cidFromSha256Hex(sha256Hex(payload))
}
