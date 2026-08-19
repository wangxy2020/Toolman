import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-constants', () => ({
  default: { expoConfig: {}, expoGoConfig: {} },
}))
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}))

import { hostnameFromHostOrUrl } from '@toolman/shared'
import { communityHubProbeFlags, shouldProbeLoopbackFromHosts } from './desktopDevHost'

describe('hostnameFromHostOrUrl', () => {
  it('parses Expo hostUri and Hub URLs', () => {
    expect(hostnameFromHostOrUrl('192.168.1.8:8081')).toBe('192.168.1.8')
    expect(hostnameFromHostOrUrl('http://100.64.1.8:3721/')).toBe('100.64.1.8')
    expect(hostnameFromHostOrUrl('localhost:8081')).toBe('localhost')
  })
})

describe('shouldProbeLoopbackFromHosts', () => {
  it('probes loopback for all web pages so same-computer desktop can sync', () => {
    expect(
      shouldProbeLoopbackFromHosts({
        platformOs: 'web',
        pageHostname: 'localhost',
        hostnames: ['localhost'],
      }),
    ).toBe(true)
    expect(
      shouldProbeLoopbackFromHosts({
        platformOs: 'web',
        pageHostname: 'www.toolman.work',
        hostnames: [],
      }),
    ).toBe(true)
  })

  it('probes loopback on native only when every packager host is loopback', () => {
    expect(
      shouldProbeLoopbackFromHosts({
        platformOs: 'ios',
        pageHostname: '',
        hostnames: ['127.0.0.1'],
      }),
    ).toBe(true)
    expect(
      shouldProbeLoopbackFromHosts({
        platformOs: 'ios',
        pageHostname: '',
        hostnames: ['192.168.1.8'],
      }),
    ).toBe(false)
  })
})

describe('communityHubProbeFlags', () => {
  it('skips phone loopback on hosted web and prefers the official catalog', () => {
    vi.stubGlobal('location', { host: 'www.toolman.work', hostname: 'www.toolman.work' })
    const flags = communityHubProbeFlags()
    expect(flags.includeLoopback).toBe(false)
    expect(flags.includeOfficialHub).toBe(true)
    expect(flags.officialHubFirst).toBe(true)
    vi.unstubAllGlobals()
  })
})
