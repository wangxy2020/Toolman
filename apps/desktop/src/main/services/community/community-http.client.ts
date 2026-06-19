import {
  COMMUNITY_HUB_HEADER,
  COMMUNITY_HUB_IDENTITY_ID,
  buildCommunityHubBaseUrl,
} from './community-paths'

export interface CommunityApiResponse<T> {
  ok: boolean
  data: T
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
}

export interface CommunityHealthData {
  status: string
  version: string
  db: string
  data_dir?: string
  require_review?: boolean
  user_count?: number
  resource_count?: number
}

export class CommunityHttpError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'CommunityHttpError'
    this.status = status
    this.code = code
  }
}

export interface CommunityHttpClientOptions {
  port: number
  host?: string
  identityId?: string
  fetchImpl?: typeof fetch
}

export class CommunityHttpClient {
  private readonly baseUrl: string
  private readonly identityId: string
  private readonly fetchImpl: typeof fetch

  constructor(options: CommunityHttpClientOptions) {
    this.baseUrl = buildCommunityHubBaseUrl(options.port, options.host)
    this.identityId = options.identityId ?? COMMUNITY_HUB_IDENTITY_ID
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  get apiBaseUrl(): string {
    return `${this.baseUrl}/api/v1`
  }

  async health(): Promise<CommunityHealthData> {
    return this.request<CommunityHealthData>('/health', {
      method: 'GET',
      authenticated: false,
    })
  }

  async get<T>(path: string, options?: { authenticated?: boolean }): Promise<T> {
    return this.request<T>(path, { method: 'GET', authenticated: options?.authenticated })
  }

  async post<T>(
    path: string,
    body?: unknown,
    options?: { authenticated?: boolean },
  ): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      authenticated: options?.authenticated,
    })
  }

  async patch<T>(
    path: string,
    body?: unknown,
    options?: { authenticated?: boolean },
  ): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
      authenticated: options?.authenticated,
    })
  }

  async delete<T>(path: string, options?: { authenticated?: boolean }): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', authenticated: options?.authenticated })
  }

  async postMultipart<T>(
    path: string,
    fields: Array<{ name: string; value: string | Buffer; filename?: string }>,
    options?: { authenticated?: boolean },
  ): Promise<T> {
    const form = new FormData()
    for (const field of fields) {
      if (typeof field.value === 'string') {
        form.append(field.name, field.value)
      } else {
        form.append(field.name, new Blob([new Uint8Array(field.value)]), field.filename ?? 'upload.bin')
      }
    }

    return this.request<T>(path, {
      method: 'POST',
      body: form,
      authenticated: options?.authenticated,
    })
  }

  private resolveUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    if (normalizedPath.startsWith('/health') || normalizedPath.startsWith('/api/v1')) {
      return `${this.baseUrl}${normalizedPath}`
    }
    return `${this.baseUrl}/api/v1${normalizedPath}`
  }

  private async request<T>(
    path: string,
    init: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
      body?: string | FormData
      authenticated?: boolean
    } = { method: 'GET' },
  ): Promise<T> {
    const url = this.resolveUrl(path)

    const headers = new Headers({
      Accept: 'application/json',
    })
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }
    if (init.authenticated !== false) {
      headers.set(COMMUNITY_HUB_HEADER, this.identityId)
    }

    const response = await this.fetchImpl(url, {
      method: init.method,
      headers,
      body: init.body,
    })

    const text = await response.text()
    let payload: CommunityApiResponse<T>
    if (text) {
      try {
        payload = JSON.parse(text) as CommunityApiResponse<T>
      } catch {
        throw new CommunityHttpError(
          `Community API returned invalid JSON (${response.status})`,
          response.status,
          'INVALID_JSON',
        )
      }
    } else if (!response.ok) {
      const hint =
        response.status === 404
          ? '接口不存在，请重新构建并重启 Community Hub（pnpm build:community-hub 后重启应用）'
          : `Community API request failed (${response.status})`
      throw new CommunityHttpError(hint, response.status, 'EMPTY_RESPONSE')
    } else {
      payload = {
        ok: false,
        data: null as T,
        error: { code: 'EMPTY_RESPONSE', message: 'Empty response body' },
      }
    }
    if (!response.ok || !payload.ok) {
      throw new CommunityHttpError(
        payload.error?.message ?? `Community API request failed: ${response.status}`,
        response.status,
        payload.error?.code,
      )
    }

    return payload.data
  }
}
