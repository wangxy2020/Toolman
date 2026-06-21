import { describe, expect, it } from 'vitest'
import {
  WAN_COMPRESSED_SDP_TARGET_BYTES,
  decodeWanSdpParam,
  encodeWanSdpParam,
  filterWanSdpMedia,
  packWanInviteBundle,
  unpackWanInviteBundle,
} from './wan-transport'

const SAMPLE_SDP = [
  'v=0',
  'o=- 0 0 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0 1 2',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=rtpmap:111 opus/48000/2',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:efgh',
  'a=candidate:1 1 udp 2130706431 192.168.1.2 50001 typ host',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=rtpmap:96 VP8/90000',
  'a=candidate:2 1 udp 2130706431 192.168.1.2 50002 typ host',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'a=setup:actpass',
  'a=mid:2',
  'a=fingerprint:sha-256 00:11:22',
  'a=toolman-sig:41234',
  'a=candidate:3 1 udp 2130706431 203.0.113.10 50003 typ srflx',
  'a=candidate:4 1 udp 2130706431 198.51.100.8 50004 typ relay',
  '',
].join('\r\n')

describe('filterWanSdpMedia', () => {
  it('removes audio and video media sections', () => {
    const filtered = filterWanSdpMedia(SAMPLE_SDP)
    expect(filtered).not.toMatch(/^m=audio/m)
    expect(filtered).not.toMatch(/^m=video/m)
    expect(filtered).toMatch(/^m=application/m)
    expect(filtered).toContain('a=toolman-sig:41234')
  })
})

describe('encodeWanSdpParam', () => {
  it('round-trips filtered sdp with wan prefix', () => {
    const encoded = encodeWanSdpParam(SAMPLE_SDP)
    expect(encoded.startsWith('z1.') || encoded.startsWith('r1.')).toBe(true)
    const decoded = decodeWanSdpParam(encoded)
    expect(decoded.startsWith('v=0')).toBe(true)
    expect(decoded).not.toMatch(/^m=audio/m)
    expect(decoded).not.toMatch(/^m=video/m)
  })

  it('shrinks encoded sdp versus legacy base64', () => {
    const encoded = encodeWanSdpParam(SAMPLE_SDP)
    const legacy = Buffer.from(SAMPLE_SDP, 'utf8').toString('base64url')
    expect(Buffer.byteLength(encoded, 'utf8')).toBeLessThan(Buffer.byteLength(legacy, 'utf8'))
  })

  it('targets compact encoded sdp payload', () => {
    const encoded = encodeWanSdpParam(SAMPLE_SDP)
    expect(encoded.startsWith('z1.') || encoded.startsWith('r1.')).toBe(true)
    expect(Buffer.byteLength(encoded, 'utf8')).toBeLessThanOrEqual(
      WAN_COMPRESSED_SDP_TARGET_BYTES * 2,
    )
  })
})

describe('packWanInviteBundle', () => {
  it('round-trips token and sdp', () => {
    const packed = packWanInviteBundle('invite-token', SAMPLE_SDP)
    const unpacked = unpackWanInviteBundle(packed)
    expect(unpacked.t).toBe('invite-token')
    expect(unpacked.d).toContain('m=application')
    expect(unpacked.d).not.toMatch(/^m=audio/m)
    expect(unpacked.d).toMatch(/a=candidate:/)
  })
})
