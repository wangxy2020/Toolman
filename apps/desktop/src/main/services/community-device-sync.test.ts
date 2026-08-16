import { describe, expect, it } from 'vitest'
import { shouldStopDeviceSyncProbe } from './community-device-sync'

describe('shouldStopDeviceSyncProbe', () => {
  it('stops after a reachable local sidecar without device_sync', () => {
    expect(shouldStopDeviceSyncProbe({ official: false, deviceSync: undefined })).toBe(true)
    expect(shouldStopDeviceSyncProbe({ official: false, deviceSync: false })).toBe(true)
  })

  it('keeps probing when the official hub lacks device_sync', () => {
    expect(shouldStopDeviceSyncProbe({ official: true, deviceSync: undefined })).toBe(false)
  })

  it('does not stop when device_sync is enabled', () => {
    expect(shouldStopDeviceSyncProbe({ official: false, deviceSync: true })).toBe(false)
    expect(shouldStopDeviceSyncProbe({ official: true, deviceSync: true })).toBe(false)
  })
})
