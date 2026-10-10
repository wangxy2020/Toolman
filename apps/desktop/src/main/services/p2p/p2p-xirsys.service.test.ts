import { describe, expect, it } from 'vitest'

import { parseXirsysIceServers } from './p2p-xirsys.service'

describe('p2p-xirsys.service', () => {
  it('parses Xirsys turn response into iceServers', () => {
    const servers = parseXirsysIceServers({
      s: 'ok',
      v: {
        iceServers: {
          username: 'user',
          credential: 'pass',
          urls: ['stun:jb-turn1.xirsys.com', 'turn:jb-turn1.xirsys.com:80?transport=udp'],
        },
      },
    })

    expect(servers).toHaveLength(1)
    expect(servers[0]?.username).toBe('user')
    expect(servers[0]?.credential).toBe('pass')
    expect(servers[0]?.urls).toEqual([
      'stun:jb-turn1.xirsys.com',
      'turn:jb-turn1.xirsys.com:80?transport=udp',
    ])
  })

  it('parses the webrtc=1 iceServers array', () => {
    const servers = parseXirsysIceServers({
      s: 'ok',
      v: {
        iceServers: [
          {
            username: 'user',
            credential: 'pass',
            urls: ['turns:jb-turn1.xirsys.com:443?transport=tcp'],
          },
        ],
      },
    })
    expect(servers).toHaveLength(1)
    expect(servers[0]?.urls).toEqual(['turns:jb-turn1.xirsys.com:443?transport=tcp'])
  })
})
