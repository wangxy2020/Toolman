import { describe, expect, it } from 'vitest'
import { OFFICIAL_TOOLMAN_HUB_URL } from '../community/hub-config.js'
import {
  DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
  DEFAULT_LOCAL_SYNC_BASE_URL,
  isCommunityDeviceSyncHealthPayload,
  isCommunityMailboxHealthPayload,
  isForeignDesktopSyncHub,
  isForeignSyncIdentity,
  isPrivateOrLoopbackHostname,
  isSyncHubHealthPayload,
  isSyncHubHostsPayload,
  syncHubHealthIdentityId,
  syncRequestMayAccessHub,
  listCommunityHubProbeCandidates,
  listPairingRedeemBaseUrlCandidates,
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
  it('probes configured and local community hubs, not the official Hub', () => {
    expect(listCommunityHubProbeCandidates('')).toEqual([
      'http://localhost:3721',
      DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
    ])
    expect(listCommunityHubProbeCandidates('http://100.64.1.8:3721/')).toEqual([
      'http://100.64.1.8:3721',
      'http://localhost:3721',
      DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
    ])
    expect(
      listCommunityHubProbeCandidates('', {
        packagerHostnames: ['192.168.1.8:8081'],
      }),
    ).toEqual([
      'http://192.168.1.8:3721',
      'http://localhost:3721',
      DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
    ])
    expect(
      listCommunityHubProbeCandidates('https://hub.toolman.app', { includeLoopback: false }),
    ).toEqual([OFFICIAL_TOOLMAN_HUB_URL])
  })

  it('derives a LAN Sync Hub sibling from a community hub address', () => {
    expect(siblingHttpOrigin('http://192.168.1.8:3721', 17890)).toBe('http://192.168.1.8:17890')
  })

  it('derives LAN Sync Hub from a community host without using the Hub catalog port', () => {
    expect(
      listSyncBaseUrlCandidates({ communityHubBaseUrl: 'http://100.64.1.8:3721' }),
    ).toEqual([
      'http://100.64.1.8:17890',
      'http://localhost:17890',
      DEFAULT_LOCAL_SYNC_BASE_URL,
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
      'http://localhost:17890',
      DEFAULT_LOCAL_SYNC_BASE_URL,
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
    ).toEqual(['http://192.168.1.8:3721'])
    expect(
      listSyncBaseUrlCandidates({
        packagerHostnames: ['toolman.vercel.app', '192.168.1.8:8081'],
        includeLoopback: false,
      }),
    ).toEqual(['http://192.168.1.8:17890'])
  })

  it('does not derive a LAN Sync Hub from the official catalog', () => {
    expect(
      listSyncBaseUrlCandidates({
        communityHubBaseUrl: 'https://hub.toolman.app',
        includeLoopback: false,
      }),
    ).toEqual([OFFICIAL_TOOLMAN_HUB_URL])
  })

  it('redeems pairing only against the desktop Sync Hub, never Community Hub', () => {
    expect(listPairingRedeemBaseUrlCandidates()).toEqual([
      'http://localhost:17890',
      DEFAULT_LOCAL_SYNC_BASE_URL,
    ])
    expect(
      listPairingRedeemBaseUrlCandidates({
        configuredSyncBaseUrl: 'https://hub.toolman.app',
      }),
    ).toEqual(['http://localhost:17890', DEFAULT_LOCAL_SYNC_BASE_URL])
    expect(
      listPairingRedeemBaseUrlCandidates({
        configuredSyncBaseUrl: 'https://desktop.ts.net',
      }),
    ).toEqual(['https://desktop.ts.net', 'http://localhost:17890', DEFAULT_LOCAL_SYNC_BASE_URL])
  })

  it('accepts Sync Hub health and hosts JSON, not Community Hub envelopes', () => {
    expect(isSyncHubHealthPayload({ status: 'ok', service: 'toolman-sync-hub' })).toBe(true)
    expect(isSyncHubHealthPayload({ ok: true, data: { status: 'healthy' } })).toBe(false)
    expect(
      isCommunityDeviceSyncHealthPayload({
        ok: true,
        data: { status: 'healthy', device_sync: true },
      }),
    ).toBe(true)
    expect(
      isCommunityMailboxHealthPayload({
        ok: true,
        data: { status: 'healthy', workspace_mailbox: true },
      }),
    ).toBe(true)
    expect(isSyncHubHostsPayload({ hosts: [] })).toBe(true)
    expect(isSyncHubHostsPayload({ ok: true, data: { hosts: [] } })).toBe(false)
    expect(
      syncHubHealthIdentityId({
        status: 'ok',
        service: 'toolman-sync-hub',
        identityId: 'id-a',
      }),
    ).toBe('id-a')
    expect(isForeignSyncIdentity('id-a', 'id-b')).toBe(true)
    expect(isForeignSyncIdentity('id-a', 'id-a')).toBe(false)
    expect(isForeignSyncIdentity(null, 'id-b')).toBe(false)
    expect(
      isForeignDesktopSyncHub(
        { status: 'ok', service: 'toolman-sync-hub', identityId: 'ag-aaa' },
        'ag-bbb',
      ),
    ).toBe(true)
    expect(
      isForeignDesktopSyncHub(
        { status: 'ok', service: 'toolman-sync-hub', identityId: 'ag-aaa' },
        'ag-aaa',
      ),
    ).toBe(false)
    expect(
      isForeignDesktopSyncHub(
        { status: 'ok', service: 'toolman-sync-hub' },
        'ag-aaa',
      ),
    ).toBe(true)
    expect(
      isForeignDesktopSyncHub(
        {
          status: 'ok',
          service: 'toolman-sync-hub',
          identityId: '00000000-0000-0000-0000-000000000001',
        },
        'ag-aaa',
      ),
    ).toBe(true)
    expect(
      isForeignDesktopSyncHub(
        { status: 'ok', service: 'toolman-sync-hub', identityId: 'ag-aaa' },
        null,
      ),
    ).toBe(true)
    expect(
      isForeignDesktopSyncHub({ status: 'ok', service: 'toolman-sync-hub' }, null),
    ).toBe(false)
    expect(syncRequestMayAccessHub('ag-aaa', 'ag-aaa')).toBe(true)
    expect(syncRequestMayAccessHub('ag-bbb', 'ag-aaa')).toBe(false)
    expect(syncRequestMayAccessHub('', 'ag-aaa')).toBe(false)
    expect(syncRequestMayAccessHub('ag-bbb', null)).toBe(false)
    expect(syncRequestMayAccessHub('', null)).toBe(true)
  })
})
