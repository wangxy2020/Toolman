import { describe, expect, it, vi } from 'vitest'

vi.mock('./desktopDevHost', () => ({
  isHostedWebPage: () => true,
}))

import {
  hostedWebSyncBlockedReason,
  hostedWebSyncSoftHint,
  isHttpsSyncUrl,
} from './hostedWebSync'

describe('hostedWebSync', () => {
  it('never hard-blocks hosted web sync attempts', () => {
    expect(isHttpsSyncUrl('http://127.0.0.1:17890')).toBe(false)
    expect(hostedWebSyncBlockedReason({ configuredSyncBaseUrl: 'http://192.168.1.8:17890' })).toBeNull()
    expect(
      hostedWebSyncBlockedReason({ configuredSyncBaseUrl: 'https://desktop.ts.net' }),
    ).toBeNull()
  })

  it('does not claim hosted web cannot reach a same-computer Sync Hub', () => {
    expect(hostedWebSyncSoftHint({ configuredSyncBaseUrl: 'http://192.168.1.8:17890' })).toBeNull()
    expect(hostedWebSyncSoftHint({ configuredSyncBaseUrl: 'https://desktop.ts.net' })).toBeNull()
  })
})
