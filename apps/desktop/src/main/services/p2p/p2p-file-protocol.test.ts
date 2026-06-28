import { describe, expect, it } from 'vitest'

import {
  chunkCountForSize,
  encodeFileChannelMessage,
  P2P_BLOB_CHUNK_SIZE,
  parseFileChannelMessage,
} from './p2p-file-protocol'

describe('p2p-file-protocol', () => {
  it('computes chunk counts', () => {
    expect(chunkCountForSize(0)).toBe(0)
    expect(chunkCountForSize(1)).toBe(1)
    expect(chunkCountForSize(P2P_BLOB_CHUNK_SIZE)).toBe(1)
    expect(chunkCountForSize(P2P_BLOB_CHUNK_SIZE + 1)).toBe(2)
  })

  it('round-trips blob.request messages', () => {
    const message = {
      type: 'blob.request' as const,
      workspaceId: 'ws-1',
      contentHash: 'abc123',
      requestId: 'req-1',
    }
    const parsed = parseFileChannelMessage(encodeFileChannelMessage(message))
    expect(parsed).toMatchObject(message)
  })

  it('round-trips blob.chunk messages', () => {
    const message = {
      type: 'blob.chunk' as const,
      requestId: 'req-1',
      contentHash: 'abc123',
      index: 0,
      totalChunks: 2,
      data: 'Zm9v',
    }
    const parsed = parseFileChannelMessage(encodeFileChannelMessage(message))
    expect(parsed).toMatchObject(message)
  })

  it('keeps encoded chunk messages under the SCTP size limit', () => {
    const chunk = Buffer.alloc(P2P_BLOB_CHUNK_SIZE, 0xab)
    const encoded = encodeFileChannelMessage({
      type: 'blob.chunk',
      requestId: '00000000-0000-4000-8000-000000000001',
      contentHash: 'c'.repeat(64),
      index: 0,
      totalChunks: 99,
      data: chunk.toString('base64'),
    })
    expect(encoded.byteLength).toBeLessThan(65_536)
  })
})
