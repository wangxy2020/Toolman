import { afterEach, describe, expect, it } from 'vitest'

import { sanitizeCommunityHubConfig } from './community-hub.config'

describe('sanitizeCommunityHubConfig', () => {
  afterEach(() => {
    delete process.env.TOOLMAN_COMMUNITY_HUB_URL
    delete process.env.TOOLMAN_COMMUNITY_HUB_MODE
  })

  it('drops the official hub so local federation does not probe a central server', () => {
    expect(
      sanitizeCommunityHubConfig({
        mode: 'local',
        federation: { enabled: true },
        upstream: 'https://hub.toolman.app',
        peers: ['https://hub.toolman.app', 'http://192.168.1.10:3721'],
      }),
    ).toEqual({
      mode: 'local',
      federation: { enabled: true },
      peers: ['http://192.168.1.10:3721'],
    })
  })

  it('falls back to local when remote mode only pointed at the official hub', () => {
    expect(
      sanitizeCommunityHubConfig({
        mode: 'remote',
        baseUrl: 'https://hub.toolman.app',
        federation: { enabled: true },
      }),
    ).toEqual({
      mode: 'local',
      federation: { enabled: true },
    })
  })
})
