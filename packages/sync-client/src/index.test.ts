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
})
