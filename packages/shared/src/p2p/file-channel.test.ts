import { describe, expect, it } from 'vitest'
import {
  chunkCountForSize,
  encodeFileChannelMessageJson,
  parseFileChannelMessageJson,
  P2P_BLOB_CHUNK_SIZE,
} from './file-channel.js'

describe('file-channel', () => {
  it('chunks sizes like the desktop protocol', () => {
    expect(chunkCountForSize(0)).toBe(0)
    expect(chunkCountForSize(P2P_BLOB_CHUNK_SIZE + 1)).toBe(2)
  })

  it('round-trips blob.meta', () => {
    const json = encodeFileChannelMessageJson({
      type: 'blob.meta',
      requestId: 'r1',
      workspaceId: 'ws-a',
      contentHash: 'h1',
      sizeBytes: 10,
      totalChunks: 1,
    })
    expect(parseFileChannelMessageJson(json)?.type).toBe('blob.meta')
  })
})
