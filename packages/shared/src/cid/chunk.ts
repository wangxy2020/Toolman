import { z } from 'zod'

import { cidFromSha256Hex } from './cid.js'
import { sha256HexFromBytes } from '../utils/sha256-hex.js'

/** Matches P2P blob chunk size (48 KiB). */
export const P2P_CID_CHUNK_SIZE = 48 * 1024

export const CidChunkDescriptorSchema = z.object({
  index: z.number().int().nonnegative(),
  cid: z.string().min(1),
  size: z.number().int().positive(),
})
export type CidChunkDescriptor = z.infer<typeof CidChunkDescriptorSchema>

export function chunkBytes(data: Uint8Array, chunkSize = P2P_CID_CHUNK_SIZE): CidChunkDescriptor[] {
  if (data.length === 0) {
    throw new Error('Cannot chunk empty payload')
  }

  const chunks: CidChunkDescriptor[] = []
  let offset = 0
  let index = 0

  while (offset < data.length) {
    const end = Math.min(offset + chunkSize, data.length)
    const slice = data.subarray(offset, end)
    chunks.push({
      index,
      cid: cidFromSha256Hex(sha256HexFromBytes(slice)),
      size: slice.length,
    })
    offset = end
    index += 1
  }

  return chunks
}

export function verifyChunkCid(chunkCid: string, data: Uint8Array): boolean {
  try {
    return cidFromSha256Hex(sha256HexFromBytes(data)) === chunkCid
  } catch {
    return false
  }
}
