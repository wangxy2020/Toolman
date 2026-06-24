import { describe, expect, it, vi } from 'vitest'

import {
  allocateCommunityHubPort,
  readCommunityHubPortFile,
  writeCommunityHubPortFile,
} from './community-bridge.service'
import { buildCommunityHubBaseUrl } from './community-paths'
import { CommunityHttpClient } from './community-http.client'

describe('community bridge helpers', () => {
  it('builds base url for localhost', () => {
    expect(buildCommunityHubBaseUrl(3721)).toBe('http://127.0.0.1:3721')
  })

  it('allocates an available port', async () => {
    const port = await allocateCommunityHubPort(0)
    expect(port).toBeGreaterThan(0)
  })

  it('writes and reads hub.port file', async () => {
    const filePath = `/tmp/toolman-community-hub-port-${Date.now()}.json`
    const value = {
      host: '127.0.0.1',
      port: 4321,
      pid: 42,
      startedAt: Date.now(),
    }

    await writeCommunityHubPortFile(value, filePath)
    const loaded = await readCommunityHubPortFile(filePath)
    expect(loaded).toEqual(value)
  })
})

describe('CommunityHttpClient', () => {
  it('parses successful health response via remote baseUrl', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          status: 'healthy',
          version: '0.2.0',
          db: 'connected',
        },
      }),
    )

    const client = new CommunityHttpClient({
      baseUrl: 'https://hub.toolman.app',
      fetchImpl,
    })

    const health = await client.health()
    expect(health.status).toBe('healthy')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://hub.toolman.app/health',
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })

  it('parses successful health response', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          status: 'healthy',
          version: '0.1.0',
          db: 'connected',
        },
      }),
    )

    const client = new CommunityHttpClient({
      port: 3721,
      fetchImpl,
    })

    const health = await client.health()
    expect(health.status).toBe('healthy')
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3721/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    )
  })

  it('throws on API error body', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'missing',
          },
        },
        { status: 404 },
      ),
    )

    const client = new CommunityHttpClient({
      port: 3721,
      fetchImpl,
    })

    await expect(client.get('/api/v1/users/me')).rejects.toThrow('missing')
  })

  it('sends Authorization Bearer when resolveAuth provides a token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        ok: true,
        data: { id: 'user-1' },
      }),
    )

    const client = new CommunityHttpClient({
      port: 3721,
      fetchImpl,
      resolveAuth: async () => ({
        authorization: 'Bearer hub-token',
        identityId: '00000000-0000-0000-0000-000000000001',
      }),
    })

    await client.get('/api/v1/users/me')
    const init = fetchImpl.mock.calls[0]?.[1]
    expect(init?.headers).toBeInstanceOf(Headers)
    const headers = init?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer hub-token')
    expect(headers.get('x-community-user-id')).toBeNull()
  })
})
