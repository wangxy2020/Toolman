import { describe, expect, it } from 'vitest'
import { ToolmanSyncClient } from './index.js'

describe('ToolmanSyncClient', () => {
  it('posts push payloads to the sync API', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const client = new ToolmanSyncClient({
      baseUrl: 'https://hub.example',
      getAccessToken: async () => 'tok',
      fetchImpl: (async (input, init) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
        return new Response(
          JSON.stringify({ accepted: 1, rejected: [], serverTime: 1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as typeof fetch,
    })

    const out = await client.push({
      deviceId: 'd1',
      cursor: null,
      changes: [
        {
          entityKind: 'note',
          entityId: 'n1',
          op: 'upsert',
          updatedAt: 1,
          payload: { title: 'hi' },
        },
      ],
    })

    expect(out.accepted).toBe(1)
    expect(calls[0]?.url).toBe('https://hub.example/api/v1/sync/push')
  })

  it('unwraps community hub { ok, data } envelopes', async () => {
    const client = new ToolmanSyncClient({
      baseUrl: 'https://hub.example',
      getAccessToken: async () => null,
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: { accepted: 2, rejected: [], serverTime: 9 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof fetch,
    })

    const out = await client.push({
      deviceId: 'd1',
      cursor: null,
      changes: [],
    })
    expect(out.accepted).toBe(2)
  })

  it('rewrites unbound fetch / connection errors into a Sync Hub hint', async () => {
    const client = new ToolmanSyncClient({
      baseUrl: 'http://127.0.0.1:17890',
      getAccessToken: async () => null,
      fetchImpl: (async () => {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")
      }) as typeof fetch,
    })

    await expect(client.pull({ deviceId: 'd1', cursor: null, limit: 100 })).rejects.toThrow(
      /无法连接同步服务/,
    )
  })

  it('sends the Sync Hub pairing token header', async () => {
    let captured: HeadersInit | undefined
    const client = new ToolmanSyncClient({
      baseUrl: 'https://hub.example',
      getAccessToken: async () => 'community',
      getSyncToken: async () => 'hub-token-value',
      fetchImpl: (async (_input, init) => {
        captured = init?.headers
        return new Response(
          JSON.stringify({ accepted: 0, rejected: [], serverTime: 1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as typeof fetch,
    })
    await client.push({ deviceId: 'd1', cursor: null, changes: [] })
    const raw = new Headers(captured)
    expect(raw.get('X-Toolman-Sync-Token')).toBe('hub-token-value')
    expect(raw.get('Authorization')).toBe('Bearer hub-token-value')
  })

  it('loads a knowledge snapshot from the export endpoint', async () => {
    const client = new ToolmanSyncClient({
      baseUrl: 'https://hub.example',
      getAccessToken: async () => null,
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            exportedAt: 1,
            kbs: [],
            documents: [],
            chunks: [],
            vectors: [],
            files: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof fetch,
    })

    const snapshot = await client.exportKnowledgeSnapshot()
    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.kbs).toEqual([])
  })
})
