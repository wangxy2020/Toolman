/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWithLocalNetwork,
  isHostedPublicWebPage,
  localNetworkRequestTimeoutMs,
  primeLocalNetworkAccess,
  resetLocalNetworkPrimeStateForTests,
  targetAddressSpaceForUrl,
} from './localNetworkFetch'

describe('targetAddressSpaceForUrl', () => {
  it('annotates loopback and LAN, not same-origin proxies', () => {
    expect(targetAddressSpaceForUrl('http://127.0.0.1:17890/health')).toBe('loopback')
    expect(targetAddressSpaceForUrl('http://localhost:17890/api/v1/sync/pairing/redeem')).toBe(
      'loopback',
    )
    expect(targetAddressSpaceForUrl('http://192.168.1.8:17890/health')).toBe('local')
    expect(targetAddressSpaceForUrl('/api/community-hub/health')).toBeUndefined()
    expect(targetAddressSpaceForUrl('https://hub.toolman.app/health')).toBeUndefined()
  })
})

describe('isHostedPublicWebPage', () => {
  it('treats public DNS as hosted and loopback as local preview', () => {
    expect(isHostedPublicWebPage('www.toolman.work')).toBe(true)
    expect(isHostedPublicWebPage('localhost')).toBe(false)
    expect(isHostedPublicWebPage('127.0.0.1')).toBe(false)
    expect(isHostedPublicWebPage('')).toBe(false)
  })
})

describe('localNetworkRequestTimeoutMs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('waits for the browser permission prompt only on hosted web', () => {
    expect(localNetworkRequestTimeoutMs('http://127.0.0.1:17890/health')).toBe(2500)
    vi.stubGlobal('location', { hostname: 'www.toolman.work' })
    expect(localNetworkRequestTimeoutMs('http://127.0.0.1:17890/health')).toBe(25_000)
    expect(localNetworkRequestTimeoutMs('/api/community-hub/health')).toBe(2500)
  })
})

describe('fetchWithLocalNetwork', () => {
  it('sets targetAddressSpace on loopback requests', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchWithLocalNetwork('http://127.0.0.1:17890/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:17890/health',
      expect.objectContaining({ targetAddressSpace: 'loopback' }),
    )
    vi.unstubAllGlobals()
  })
})

describe('primeLocalNetworkAccess', () => {
  afterEach(() => {
    resetLocalNetworkPrimeStateForTests()
    vi.unstubAllGlobals()
  })

  it('probes localhost first on hosted web', async () => {
    vi.stubGlobal('location', { hostname: 'www.toolman.work' })
    const fetchMock = vi.fn(async () => new Response('{"status":"ok"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(primeLocalNetworkAccess()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:17890/health',
      expect.objectContaining({ targetAddressSpace: 'loopback' }),
    )
  })
})
