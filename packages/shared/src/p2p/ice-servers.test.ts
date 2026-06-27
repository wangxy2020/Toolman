import { describe, expect, it } from 'vitest'
import {
  resolveP2pIceServers,
  sanitizeIceServersForWebRtc,
  summarizeIceServers,
  DEFAULT_STUN_URLS,
} from './ice-servers.js'

describe('ice-servers', () => {
  it('falls back to default STUN when config is empty', () => {
    const servers = resolveP2pIceServers({})
    expect(servers).toEqual(DEFAULT_STUN_URLS.map((urls) => ({ urls })))
  })

  it('prefers structured iceServers over legacy stunServers', () => {
    const servers = resolveP2pIceServers({
      stunServers: ['stun:legacy.example:3478'],
      iceServers: [
        {
          urls: ['stun:stun.example:3478', 'turn:turn.example:3478'],
          username: 'user',
          credential: 'pass',
        },
      ],
    })
    expect(servers).toHaveLength(1)
    expect(servers[0]?.username).toBe('user')
  })

  it('summarizes STUN and authenticated TURN', () => {
    const summary = summarizeIceServers([
      { urls: 'stun:stun.example:3478' },
      { urls: 'turn:turn.example:3478', username: 'u', credential: 'p' },
    ])
    expect(summary.stunCount).toBe(1)
    expect(summary.turnCount).toBe(1)
    expect(summary.turnWithCredentials).toBe(1)
    expect(summary.summary).toContain('TURN（凭据已配置）')
  })

  it('drops TURN servers missing credentials before WebRTC use', () => {
    const sanitized = sanitizeIceServersForWebRtc([
      { urls: 'stun:stun.example:3478' },
      { urls: 'turn:turn.example:3478' },
      { urls: 'turn:turn2.example:3478', username: 'u', credential: 'p' },
    ])
    expect(sanitized).toEqual([
      { urls: 'stun:stun.example:3478' },
      { urls: 'turn:turn2.example:3478', username: 'u', credential: 'p' },
    ])
  })
})
