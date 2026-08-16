import { describe, expect, it } from 'vitest'
import { stripToolmanSignalLines } from './joinWebRtc'

describe('joinWebRtc helpers', () => {
  it('strips owner UDP signal attributes from the offer', () => {
    const sdp = ['v=0', 'o=- 1 1 IN IP4 127.0.0.1', 'a=toolman-sig:41234', 'a=ice-ufrag:ab'].join('\r\n')
    expect(stripToolmanSignalLines(sdp)).not.toContain('toolman-sig')
    expect(stripToolmanSignalLines(sdp)).toContain('a=ice-ufrag:ab')
  })
})
