import {
  KnowledgeSnapshotSchema,
  type AgentHostInvokeChunk,
  type AgentHostInvokeInput,
  type AgentHostPresence,
  type KnowledgeSnapshot,
  type SyncPullInput,
  type SyncPullOutput,
  type SyncPushInput,
  type SyncPushOutput,
} from '@toolman/shared'

export type SyncClientOptions = {
  baseUrl: string
  getAccessToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
}

async function authHeaders(getAccessToken: () => Promise<string | null>): Promise<HeadersInit> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/** Keep `this` bound to the global object — bare `fetch` throws Illegal invocation in browsers. */
const defaultFetch: typeof fetch = (input, init) =>
  globalThis.fetch.call(globalThis, input, init)

function formatSyncNetworkError(baseUrl: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error)
  if (
    /Illegal invocation|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|Network request failed/i.test(
      detail,
    )
  ) {
    return new Error(
      `无法连接桌面同步服务（${baseUrl}）。请在桌面端设置 → 系统诊断中开启「本地 Sync Hub」，并确保移动端与桌面在同一网络。`,
    )
  }
  return error instanceof Error ? error : new Error(detail)
}

export class ToolmanSyncClient {
  private readonly baseUrl: string
  private readonly getAccessToken: () => Promise<string | null>
  private readonly fetchImpl: typeof fetch

  constructor(options: SyncClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.getAccessToken = options.getAccessToken
    this.fetchImpl = options.fetchImpl ?? defaultFetch
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init)
    } catch (error) {
      throw formatSyncNetworkError(this.baseUrl, error)
    }
  }

  async push(input: SyncPushInput): Promise<SyncPushOutput> {
    const res = await this.request(`${this.baseUrl}/api/v1/sync/push`, {
      method: 'POST',
      headers: await authHeaders(this.getAccessToken),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      throw new Error(`sync push failed (${res.status})`)
    }
    return (await res.json()) as SyncPushOutput
  }

  async pull(input: SyncPullInput): Promise<SyncPullOutput> {
    const res = await this.request(`${this.baseUrl}/api/v1/sync/pull`, {
      method: 'POST',
      headers: await authHeaders(this.getAccessToken),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      throw new Error(`sync pull failed (${res.status})`)
    }
    return (await res.json()) as SyncPullOutput
  }

  async listHosts(): Promise<AgentHostPresence[]> {
    const res = await this.request(`${this.baseUrl}/api/v1/sync/hosts`, {
      method: 'GET',
      headers: await authHeaders(this.getAccessToken),
    })
    if (!res.ok) {
      throw new Error(`list hosts failed (${res.status})`)
    }
    const data = (await res.json()) as { hosts?: AgentHostPresence[] }
    return data.hosts ?? []
  }

  async *invokeHost(input: AgentHostInvokeInput): AsyncGenerator<AgentHostInvokeChunk> {
    const res = await this.request(`${this.baseUrl}/api/v1/sync/hosts/invoke`, {
      method: 'POST',
      headers: await authHeaders(this.getAccessToken),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      yield { type: 'error', error: `host invoke failed (${res.status})` }
      return
    }

    if (!res.body) {
      const json = (await res.json()) as AgentHostInvokeChunk
      yield json
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          yield JSON.parse(payload) as AgentHostInvokeChunk
        } catch {
          yield { type: 'delta', text: payload }
        }
      }
    }
  }

  async exportKnowledgeSnapshot(): Promise<KnowledgeSnapshot> {
    const res = await this.request(`${this.baseUrl}/api/v1/sync/knowledge/export`, {
      method: 'GET',
      headers: await authHeaders(this.getAccessToken),
    })
    if (!res.ok) {
      throw new Error(`knowledge export failed (${res.status})`)
    }
    return KnowledgeSnapshotSchema.parse(await res.json())
  }

  async downloadKnowledgeFile(kbId: string, documentId: string): Promise<Uint8Array> {
    const params = new URLSearchParams({ kbId, documentId })
    const res = await this.request(`${this.baseUrl}/api/v1/sync/knowledge/files?${params}`, {
      method: 'GET',
      headers: await authHeaders(this.getAccessToken),
    })
    if (!res.ok) {
      throw new Error(`knowledge file download failed (${res.status})`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }
}
