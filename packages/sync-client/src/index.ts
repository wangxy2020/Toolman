import {
  KnowledgeSnapshotSchema,
  P2P_JOIN_INVITE_ANSWER_PATH,
  P2P_JOIN_REGISTER_PATH,
  P2P_MAILBOX_SESSION_PATH,
  P2pJoinInviteAnswerOutputSchema,
  P2pJoinRegisterOutputSchema,
  P2pMailboxSessionOutputSchema,
  SYNC_HUB_TOKEN_HEADER,
  type AgentHostInvokeChunk,
  type AgentHostInvokeInput,
  type AgentHostPresence,
  type KnowledgeSnapshot,
  type P2pJoinInviteAnswerInput,
  type P2pJoinInviteAnswerOutput,
  type P2pJoinRegisterInput,
  type P2pJoinRegisterOutput,
  type P2pMailboxSessionInput,
  type P2pMailboxSessionOutput,
  type SyncPullInput,
  type SyncPullOutput,
  type SyncPushInput,
  type SyncPushOutput,
} from '@toolman/shared'

export type SyncClientOptions = {
  baseUrl: string
  getAccessToken: () => Promise<string | null>
  /** Desktop Sync Hub pairing token. Sent as `X-Toolman-Sync-Token` and Bearer. */
  getSyncToken?: () => Promise<string | null>
  getIdentityId?: () => Promise<string | null>
  fetchImpl?: typeof fetch
}

async function authHeaders(
  getAccessToken: () => Promise<string | null>,
  getIdentityId?: () => Promise<string | null>,
  getSyncToken?: () => Promise<string | null>,
): Promise<HeadersInit> {
  const [accessToken, identityId, syncToken] = await Promise.all([
    getAccessToken(),
    getIdentityId ? getIdentityId() : Promise.resolve(null),
    getSyncToken ? getSyncToken() : Promise.resolve(null),
  ])
  const token = syncToken || accessToken
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (syncToken) headers[SYNC_HUB_TOKEN_HEADER || 'X-Toolman-Sync-Token'] = syncToken
  if (identityId) headers['X-Community-User-Id'] = identityId
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
      `无法连接同步服务（${baseUrl}）。请在桌面端开启「与移动端同步」并完全重启；真机请填写电脑的局域网 / Tailscale 地址（端口 17890）。`,
    )
  }
  return error instanceof Error ? error : new Error(detail)
}

async function readJson<T>(res: Response): Promise<T> {
  const json: unknown = await res.json()
  if (json && typeof json === 'object' && 'data' in json && 'ok' in json) {
    return (json as { data: T }).data
  }
  return json as T
}

export class ToolmanSyncClient {
  private readonly baseUrl: string
  private readonly getAccessToken: () => Promise<string | null>
  private readonly getSyncToken?: () => Promise<string | null>
  private readonly getIdentityId?: () => Promise<string | null>
  private readonly fetchImpl: typeof fetch

  constructor(options: SyncClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.getAccessToken = options.getAccessToken
    this.getSyncToken = options.getSyncToken
    this.getIdentityId = options.getIdentityId
    this.fetchImpl = options.fetchImpl ?? defaultFetch
  }

  private headers(): Promise<HeadersInit> {
    return authHeaders(this.getAccessToken, this.getIdentityId, this.getSyncToken)
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
      headers: await this.headers(),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      throw new Error(`sync push failed (${res.status})`)
    }
    return readJson<SyncPushOutput>(res)
  }

  async pull(input: SyncPullInput): Promise<SyncPullOutput> {
    const res = await this.request(`${this.baseUrl}/api/v1/sync/pull`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      throw new Error(`sync pull failed (${res.status})`)
    }
    return readJson<SyncPullOutput>(res)
  }

  async registerInvitedMember(input: P2pJoinRegisterInput): Promise<P2pJoinRegisterOutput> {
    const res = await this.request(`${this.baseUrl}${P2P_JOIN_REGISTER_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
    const json: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const error =
        json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
          ? json.error
          : `邀请登记失败（${res.status}）`
      throw new Error(error)
    }
    return P2pJoinRegisterOutputSchema.parse(json)
  }

  async submitInviteAnswer(input: P2pJoinInviteAnswerInput): Promise<P2pJoinInviteAnswerOutput> {
    const res = await this.request(`${this.baseUrl}${P2P_JOIN_INVITE_ANSWER_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
    const json: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const error =
        json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
          ? json.error
          : `邀请应答失败（${res.status}）`
      throw new Error(error)
    }
    return P2pJoinInviteAnswerOutputSchema.parse(json)
  }

  async fetchMailboxSession(input: P2pMailboxSessionInput): Promise<P2pMailboxSessionOutput> {
    const res = await this.request(`${this.baseUrl}${P2P_MAILBOX_SESSION_PATH}`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(input),
    })
    const json: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const error =
        json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
          ? json.error
          : `信箱会话失败（${res.status}）`
      throw new Error(error)
    }
    return P2pMailboxSessionOutputSchema.parse(json)
  }

  async listHosts(): Promise<AgentHostPresence[]> {
    const res = await this.request(`${this.baseUrl}/api/v1/sync/hosts`, {
      method: 'GET',
      headers: await this.headers(),
    })
    if (!res.ok) {
      throw new Error(`list hosts failed (${res.status})`)
    }
    const data = await readJson<{ hosts?: AgentHostPresence[] }>(res)
    return data.hosts ?? []
  }

  async *invokeHost(input: AgentHostInvokeInput): AsyncGenerator<AgentHostInvokeChunk> {
    const res = await this.request(`${this.baseUrl}/api/v1/sync/hosts/invoke`, {
      method: 'POST',
      headers: await this.headers(),
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

  async exportKnowledgeSnapshot(since?: number): Promise<KnowledgeSnapshot> {
    const query =
      typeof since === 'number' && since > 0 ? `?since=${encodeURIComponent(String(since))}` : ''
    const res = await this.request(`${this.baseUrl}/api/v1/sync/knowledge/export${query}`, {
      method: 'GET',
      headers: await this.headers(),
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
      headers: await this.headers(),
    })
    if (!res.ok) {
      throw new Error(`knowledge file download failed (${res.status})`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }
}
