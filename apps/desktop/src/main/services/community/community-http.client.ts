import { randomBytes } from 'node:crypto'
import { toErrorMessage } from '@toolman/shared'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { URL } from 'node:url'

import {
  COMMUNITY_HUB_HEADER,
  COMMUNITY_HUB_IDENTITY_ID,
  buildCommunityHubBaseUrl,
} from './community-paths'
import type { CommunityHubAuthContext } from './community-hub-auth.service'

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
  rate_limit_rpm?: number
  user_count?: number
  resource_count?: number
  federation_peering?: boolean
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

const MAX_CONCURRENT_COMMUNITY_REQUESTS = 4
let activeCommunityRequests = 0
const pendingCommunityRequests: Array<() => void> = []

async function acquireCommunityRequestSlot(): Promise<void> {
  if (activeCommunityRequests < MAX_CONCURRENT_COMMUNITY_REQUESTS) {
    activeCommunityRequests += 1
    return
  }

  await new Promise<void>((resolve) => {
    pendingCommunityRequests.push(() => {
      activeCommunityRequests += 1
      resolve()
    })
  })
}

function releaseCommunityRequestSlot(): void {
  activeCommunityRequests = Math.max(0, activeCommunityRequests - 1)
  const next = pendingCommunityRequests.shift()
  next?.()
}

export function isCommunityFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  const cause = (error as Error & { cause?: { code?: string } }).cause
  const causeCode = cause?.code?.toLowerCase() ?? ''
  const nodeCode = (error as NodeJS.ErrnoException).code?.toLowerCase() ?? ''
  return (
    nodeCode === 'econnreset' ||
    nodeCode === 'epipe' ||
    nodeCode === 'etimedout' ||
    nodeCode === 'econnrefused' ||
    (error.name === 'TypeError' &&
      (message.includes('fetch failed') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('etimedout') ||
        message.includes('econnreset') ||
        causeCode.includes('econnrefused') ||
        causeCode.includes('enotfound') ||
        causeCode.includes('etimedout') ||
        causeCode.includes('econnreset')))
  )
}

export function humanizeCommunityFetchError(error: unknown): string {
  if (error instanceof CommunityHttpError) {
    if (
      error.status === 429 ||
      error.code === 'RATE_LIMITED' ||
      error.message.toLowerCase().includes('rate limit')
    ) {
      return '社区服务请求过于频繁，请稍后再试'
    }
    return error.message
  }
  if (isCommunityFetchNetworkError(error)) {
    return '无法连接 Community Hub。双实例测试请先启动用户 A，并确认 Hub 正常运行后重试。'
  }
  return toErrorMessage(error, 'Community 请求失败')
}

export interface CommunityHttpClientOptions {
  port?: number
  host?: string
  baseUrl?: string
  identityId?: string
  fetchImpl?: typeof fetch
  resolveAuth?: () => Promise<CommunityHubAuthContext> | CommunityHubAuthContext
}

export class CommunityHttpClient {
  private readonly baseUrl: string
  private readonly identityId: string
  private readonly fetchImpl: typeof fetch
  private readonly resolveAuth?: () => Promise<CommunityHubAuthContext> | CommunityHubAuthContext

  constructor(options: CommunityHttpClientOptions) {
    if (options.baseUrl) {
      this.baseUrl = options.baseUrl.replace(/\/$/, '')
    } else if (options.port != null) {
      this.baseUrl = buildCommunityHubBaseUrl(options.port, options.host)
    } else {
      throw new Error('CommunityHttpClient requires baseUrl or port')
    }
    this.identityId = options.identityId ?? COMMUNITY_HUB_IDENTITY_ID
    this.fetchImpl = options.fetchImpl ?? fetch
    this.resolveAuth = options.resolveAuth
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

  async downloadBinary(path: string, options?: { authenticated?: boolean }): Promise<Buffer> {
    const url = this.resolveUrl(path)
    const headers = new Headers()
    if (options?.authenticated !== false) {
      await this.applyAuthHeaders(headers)
    }

    const response = await this.fetchImpl(url, { method: 'GET', headers }).catch(
      (error: unknown) => {
        if (isCommunityFetchNetworkError(error)) {
          throw new CommunityHttpError(
            humanizeCommunityFetchError(error),
            0,
            'HUB_CONNECTION_FAILED',
          )
        }
        throw error
      },
    )

    if (!response.ok) {
      const text = await response.text()
      let message = `Community API request failed: ${response.status}`
      try {
        const payload = JSON.parse(text) as CommunityApiResponse<unknown>
        if (payload.error?.message) {
          message = payload.error.message
        }
      } catch {
        if (text.trim()) {
          message = text.trim()
        }
      }
      throw new CommunityHttpError(message, response.status, 'DOWNLOAD_FAILED')
    }

    return Buffer.from(await response.arrayBuffer())
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
    const { body, contentType } = buildMultipartBody(fields)
    const url = this.resolveUrl(path)

    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': contentType,
      'Content-Length': String(body.length),
    })
    if (options?.authenticated !== false) {
      await this.applyAuthHeaders(headers)
    }

    const { status, text } = await postBuffer(url, headers, body).catch((error: unknown) => {
      if (isCommunityFetchNetworkError(error)) {
        throw new CommunityHttpError(
          humanizeCommunityFetchError(error),
          0,
          'HUB_CONNECTION_FAILED',
        )
      }
      throw error
    })
    return parseCommunityApiResponse<T>(text, status)
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
      body?: string | Buffer | FormData
      contentType?: string
      authenticated?: boolean
    } = { method: 'GET' },
  ): Promise<T> {
    const maxAttempts = 3
    let lastError: unknown

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.requestOnce<T>(path, init)
      } catch (error) {
        lastError = error
        const shouldRetry =
          error instanceof CommunityHttpError &&
          (error.status === 429 || error.status >= 500) &&
          attempt < maxAttempts - 1
        if (!shouldRetry) {
          throw error
        }
        await sleepMs(1200 * (attempt + 1))
      }
    }

    throw lastError
  }

  private async requestOnce<T>(
    path: string,
    init: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
      body?: string | Buffer | FormData
      contentType?: string
      authenticated?: boolean
    } = { method: 'GET' },
  ): Promise<T> {
    await acquireCommunityRequestSlot()
    try {
      const url = this.resolveUrl(path)

      const headers = new Headers({
        Accept: 'application/json',
      })
      if (init.contentType) {
        headers.set('Content-Type', init.contentType)
        if (init.body instanceof Buffer) {
          headers.set('Content-Length', String(init.body.length))
        }
      } else if (init.body !== undefined && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json')
      }
      if (init.authenticated !== false) {
        await this.applyAuthHeaders(headers)
      }

      const response = await this.fetchImpl(url, {
        method: init.method,
        headers,
        body: init.body instanceof Buffer ? new Uint8Array(init.body) : init.body,
      }).catch((error: unknown) => {
        if (isCommunityFetchNetworkError(error)) {
          throw new CommunityHttpError(
            humanizeCommunityFetchError(error),
            0,
            'HUB_CONNECTION_FAILED',
          )
        }
        throw error
      })

      const text = await response.text()
      return parseCommunityApiResponse<T>(text, response.status)
    } finally {
      releaseCommunityRequestSlot()
    }
  }

  private async applyAuthHeaders(headers: Headers): Promise<void> {
    const auth = this.resolveAuth
      ? await Promise.resolve(this.resolveAuth())
      : { identityId: this.identityId }

    headers.set(COMMUNITY_HUB_HEADER, auth.identityId)

    if (auth.authorization) {
      headers.set('Authorization', auth.authorization)
    }
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function parseCommunityApiResponse<T>(text: string, status: number): T {
  let payload: CommunityApiResponse<T>
  if (text) {
    try {
      payload = JSON.parse(text) as CommunityApiResponse<T>
    } catch {
      throw new CommunityHttpError(
        `Community API returned invalid JSON (${status})`,
        status,
        'INVALID_JSON',
      )
    }
  } else if (status < 200 || status >= 300) {
    const hint =
      status === 404
        ? '接口不存在，请重新构建并重启 Community Hub（pnpm build:community-hub 后重启应用）'
        : `Community API request failed (${status})`
    throw new CommunityHttpError(hint, status, 'EMPTY_RESPONSE')
  } else {
    payload = {
      ok: false,
      data: null as T,
      error: { code: 'EMPTY_RESPONSE', message: 'Empty response body' },
    }
  }
  if (status < 200 || status >= 300 || !payload.ok) {
    throw new CommunityHttpError(
      payload.error?.message ?? `Community API request failed: ${status}`,
      status,
      payload.error?.code,
    )
  }

  return payload.data
}

/** node:http upload avoids Electron fetch multipart parsing issues with Axum. */
async function postBuffer(
  url: string,
  headers: Headers,
  body: Buffer,
): Promise<{ status: number; text: string }> {
  const parsed = new URL(url)
  const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
  const headerRecord = Object.fromEntries(headers.entries())

  return await new Promise((resolve, reject) => {
    const req = requestFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: headerRecord,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

/** Manual multipart builder — Node/Electron fetch + FormData often breaks Axum parsing. */
export function buildMultipartBody(
  fields: Array<{ name: string; value: string | Buffer; filename?: string }>,
): { body: Buffer; contentType: string } {
  const boundary = `toolman-${randomBytes(16).toString('hex')}`
  const chunks: Buffer[] = []

  for (const field of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    if (typeof field.value === 'string') {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n`))
      chunks.push(Buffer.from(field.value))
      chunks.push(Buffer.from('\r\n'))
      continue
    }

    const filename = field.filename ?? 'upload.bin'
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${field.name}"; filename="${filename}"\r\n`,
      ),
    )
    chunks.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'))
    chunks.push(field.value)
    chunks.push(Buffer.from('\r\n'))
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}
