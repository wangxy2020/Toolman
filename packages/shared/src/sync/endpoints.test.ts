import { describe, expect, it } from 'vitest'
import { OFFICIAL_TOOLMAN_HUB_URL } from '../community/hub-config.js'
import {
  DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
  DEFAULT_LOCAL_SYNC_BASE_URL,
  isPrivateOrLoopbackHostname,
  isSyncHubHealthPayload,
  isSyncHubHostsPayload,
  listCommunityHubProbeCandidates,
  listSyncBaseUrlCandidates,
  siblingHttpOrigin,
} from './endpoints.js'

describe('isPrivateOrLoopbackHostname', () => {
  it('keeps LAN and Tailscale hosts, rejects public DNS', () => {
    expect(isPrivateOrLoopbackHostname('192.168.1.8')).toBe(true)
    expect(isPrivateOrLoopbackHostname('100.64.1.8')).toBe(true)
    expect(isPrivateOrLoopbackHostname('toolman.local')).toBe(true)
    expect(isPrivateOrLoopbackHostname('toolman.vercel.app')).toBe(false)
  })
})

describe('sync endpoint candidates', () => {
  it('probes configured, local, then official community hubs', () => {
    expect(listCommunityHubProbeCandidates('')).toEqual([
      'http://localhost:3721',
      DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
      OFFICIAL_TOOLMAN_HUB_URL,
    ])
    expect(listCommunityHubProbeCandidates('http://100.64.1.8:3721/')).toEqual([
      'http://100.64.1.8:3721',
      'http://localhost:3721',
      DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
      OFFICIAL_TOOLMAN_HUB_URL,
    ])
    expect(
      listCommunityHubProbeCandidates('', {
        packagerHostnames: ['192.168.1.8:8081'],
      }),
    ).toEqual([
      'http://192.168.1.8:3721',
      'http://localhost:3721',
      DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
      OFFICIAL_TOOLMAN_HUB_URL,
    ])
  })

  it('derives a LAN Sync Hub sibling from a community hub address', () => {
    expect(siblingHttpOrigin('http://192.168.1.8:3721', 17890)).toBe('http://192.168.1.8:17890')
  })

  it('derives LAN Sync Hub from a community host without using the Hub catalog port', () => {
    expect(
      listSyncBaseUrlCandidates({ communityHubBaseUrl: 'http://100.64.1.8:3721' }),
    ).toEqual([
      'http://100.64.1.8:17890',
      DEFAULT_LOCAL_SYNC_BASE_URL,
      'http://localhost:17890',
    ])
  })

  it('prefers Expo packager LAN hosts ahead of loopback community URLs', () => {
    expect(
      listSyncBaseUrlCandidates({
        communityHubBaseUrl: 'http://127.0.0.1:3721',
        packagerHostnames: ['192.168.1.8:8081'],
      }),
    ).toEqual([
      'http://192.168.1.8:17890',
      DEFAULT_LOCAL_SYNC_BASE_URL,
      'http://localhost:17890',
    ])
  })

  it('prefers Expo packager hosts and can omit loopback', () => {
    expect(
      listSyncBaseUrlCandidates({
        packagerHostnames: ['192.168.1.8:8081'],
        includeLoopback: false,
      }),
    ).toEqual(['http://192.168.1.8:17890'])
  })

  it('ignores public hosted hostnames such as Vercel', () => {
    expect(
      listCommunityHubProbeCandidates('', {
        packagerHostnames: ['toolman.vercel.app', '192.168.1.8:8081'],
        includeLoopback: false,
      }),
    ).toEqual(['http://192.168.1.8:3721', OFFICIAL_TOOLMAN_HUB_URL])
    expect(
      listSyncBaseUrlCandidates({
        packagerHostnames: ['toolman.vercel.app', '192.168.1.8:8081'],
        includeLoopback: false,
      }),
    ).toEqual(['http://192.168.1.8:17890'])
  })

  it('does not treat the official community catalog as a Sync Hub', () => {
    expect(
      listSyncBaseUrlCandidates({
        communityHubBaseUrl: 'https://hub.toolman.app',
        includeLoopback: false,
      }),
    ).toEqual([])
  })

  it('accepts Sync Hub health and hosts JSON, not Community Hub envelopes', () => {
    expect(isSyncHubHealthPayload({ status: 'ok', service: 'toolman-sync-hub' })).toBe(true)
    expect(isSyncHubHealthPayload({ ok: true, data: { status: 'healthy' } })).toBe(false)
    expect(isSyncHubHostsPayload({ hosts: [] })).toBe(true)
    expect(isSyncHubHostsPayload({ ok: true, data: { hosts: [] } })).toBe(false)
  })
})
