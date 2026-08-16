import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-community-device-sync-test',
  },
}))

import {
  listCommunityDeviceSyncHubCandidates,
  shouldStopDeviceSyncProbe,
} from './community-device-sync'

describe('shouldStopDeviceSyncProbe', () => {
  it('never stops — always allow fallthrough to official Hub', () => {
    expect(shouldStopDeviceSyncProbe({ official: false, deviceSync: undefined })).toBe(false)
    expect(shouldStopDeviceSyncProbe({ official: false, deviceSync: false })).toBe(false)
    expect(shouldStopDeviceSyncProbe({ official: true, deviceSync: undefined })).toBe(false)
    expect(shouldStopDeviceSyncProbe({ official: false, deviceSync: true })).toBe(false)
  })
})

describe('listCommunityDeviceSyncHubCandidates', () => {
  it('includes local sidecar and official Hub when remote is unset', () => {
    const urls = listCommunityDeviceSyncHubCandidates()
    expect(urls.some((url) => url.includes('127.0.0.1') || url.includes('localhost'))).toBe(true)
    expect(urls.some((url) => url.includes('hub.toolman.app'))).toBe(true)
  })
})
