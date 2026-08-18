/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}))
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}))
vi.mock('./identityScope', () => ({
  loadOwnedScoped: async () => null,
  saveOwnedScoped: async () => undefined,
}))
vi.mock('../settings/prefs', () => ({
  loadModulePrefs: async () => ({ sync: {}, community: {} }),
}))
vi.mock('../sync/desktopDevHost', () => ({
  isHostedWebPage: () => true,
}))

import { redeemDevicePairingCode } from './devicePairing'

const offer = {
  v: 1 as const,
  identityId: 'ag-test',
  desktopDeviceId: 'desk-1',
  workspaceKeyB64: 'AAAAAAAAAAAAAAAA',
  grant: 'BBBBBBBBBBBBBBBB',
  createdAt: 1,
  expiresAt: 9_999_999_999,
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('redeemDevicePairingCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redeems against localhost Sync Hub and never the community catalog', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('localhost:17890') && url.includes('/pairing/redeem')) {
        return jsonResponse(200, { offer })
      }
      return jsonResponse(404, { error: 'missing' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const record = await redeemDevicePairingCode({
      code: 'AB23',
      localDeviceId: 'web-1',
      role: 'web',
    })
    expect(record.peerDeviceId).toBe('desk-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:17890/api/v1/sync/pairing/redeem',
      expect.objectContaining({ targetAddressSpace: 'loopback' }),
    )
  })

  it('falls through to 127.0.0.1 when localhost is unreachable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('localhost:17890')) throw new TypeError('Failed to fetch')
      if (url.includes('127.0.0.1:17890')) return jsonResponse(200, { offer })
      return jsonResponse(404, {})
    })
    vi.stubGlobal('fetch', fetchMock)

    const record = await redeemDevicePairingCode({
      code: 'AB23',
      localDeviceId: 'web-1',
      role: 'web',
    })
    expect(record.grant).toBe('BBBBBBBBBBBBBBBB')
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      'http://localhost:17890/api/v1/sync/pairing/redeem',
      'http://127.0.0.1:17890/api/v1/sync/pairing/redeem',
    ])
  })

  it('treats 401 from the desktop hub as a wrong pairing code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: 'unauthorized' })),
    )
    await expect(
      redeemDevicePairingCode({ code: 'AB23', localDeviceId: 'web-1', role: 'web' }),
    ).rejects.toThrow('配对码不正确')
  })
})
