import { describe, expect, it } from 'vitest'

import { cidFromSha256Hex, computeRootCidFromChunkCids, parseToolmanCid } from './cid.js'
import { chunkBytes, verifyChunkCid } from './chunk.js'
import { buildCidPackageManifest, buildCidManifestSignedPayload } from './manifest.js'

describe('toolman cid', () => {
  it('builds toolman:sha256 prefix', () => {
    const digest = 'a'.repeat(64)
    const cid = cidFromSha256Hex(digest)
    expect(cid).toBe(`toolman:sha256:${digest}`)
    expect(parseToolmanCid(cid)?.digestHex).toBe(digest)
  })

  it('chunks bytes and verifies chunk cid', () => {
    const data = new TextEncoder().encode('hello cid chunking')
    const chunks = chunkBytes(data)
    expect(chunks).toHaveLength(1)
    expect(verifyChunkCid(chunks[0]!.cid, data)).toBe(true)
  })

  it('builds stable manifest root cid', () => {
    const data = new TextEncoder().encode('package-bytes')
    const manifest = buildCidPackageManifest({
      packageId: 'pkg-1',
      name: 'Demo',
      version: '1.0.0',
      data,
    })
    const again = buildCidPackageManifest({
      packageId: 'pkg-1',
      name: 'Demo',
      version: '1.0.0',
      data,
    })
    expect(manifest.rootCid).toBe(again.rootCid)
    expect(computeRootCidFromChunkCids(manifest.chunks.map((chunk) => chunk.cid))).toBe(
      manifest.rootCid,
    )
    expect(buildCidManifestSignedPayload(manifest)).toContain(manifest.rootCid)
  })
})
