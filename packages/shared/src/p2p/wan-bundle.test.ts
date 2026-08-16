import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { WAN_COMPRESSED_PAYLOAD_PREFIX } from './invite-url.js'
import { unpackWanInviteBundle } from './wan-bundle.js'

describe('unpackWanInviteBundle', () => {
  it('reads a raw r1 invite bundle', async () => {
    const json = JSON.stringify({ t: 'token-1', d: 'v=0\r\no=test\r\n' })
    const encoded = `r1.${Buffer.from(json, 'utf8').toString('base64url')}`
    const unpacked = await unpackWanInviteBundle(encoded)
    expect(unpacked.t).toBe('token-1')
    expect(unpacked.d).toContain('v=0')
  })

  it('inflates a z1 gzip invite bundle', async () => {
    const json = JSON.stringify({ t: 'token-z', d: 'v=0\r\no=offer\r\n' })
    const encoded = `${WAN_COMPRESSED_PAYLOAD_PREFIX}${gzipSync(Buffer.from(json, 'utf8')).toString('base64url')}`
    const unpacked = await unpackWanInviteBundle(encoded)
    expect(unpacked.t).toBe('token-z')
    expect(unpacked.d).toContain('o=offer')
  })
})
