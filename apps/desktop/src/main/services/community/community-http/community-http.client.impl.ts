import {
  COMMUNITY_HUB_HEADER,
  COMMUNITY_HUB_IDENTITY_ID,
  buildCommunityHubBaseUrl,
} from '../community-paths'
import type { CommunityHubAuthContext } from '../community-hub-auth.service'
import { acquireCommunityRequestSlot, releaseCommunityRequestSlot } from './community-http.concurrency'
import { humanizeCommunityFetchError, isCommunityFetchNetworkError, isRetryableHubBearerError } from './community-http.errors'
import { buildMultipartBody, postBuffer } from './community-http.multipart'
import { parseCommunityApiResponse, sleepMs } from './community-http.parse'
import {
  CommunityHttpError,
  type CommunityHealthData,
  type CommunityHttpClientOptions,
} from './community-http.types'

export class CommunityHttpClient {
  private readonly baseUrl: string
  private readonly identityId: string
  private readonly fetchImpl: typeof fetch
  private readonly resolveAuth?: () => Promise<CommunityHubAuthContext> | CommunityHubAuthContext
  /** After a JWT 401, prefer the identity header so a stale sidecar secret does not block reads. */
  private skipBearer = false

  constructor(options: CommunityHttpClientOptions) {
    if (options.baseUrl) {
      this.baseUrl = options.baseUrl.replace(/\/$/, '')
    } else if (options.port != null) {
      this.baseUrl = buildCommunityHubBaseUrl(options.port, options.host)
    } else {
      throw new Error('CommunityHttpClient requires baseUrl or port')
    }
    this.identityId = options.identityId ?? COMMUNITY_HUB_IDENTITY_ID
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
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
        const payload = JSON.parse(text) as { error?: { message?: string } }
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
      try {
        return parseCommunityApiResponse<T>(text, response.status)
      } catch (error) {
        if (
          init.authenticated !== false &&
          headers.has('Authorization') &&
          isRetryableHubBearerError(error)
        ) {
          this.skipBearer = true
          headers.delete('Authorization')
          const retryResponse = await this.fetchImpl(url, {
            method: init.method,
            headers,
            body: init.body instanceof Buffer ? new Uint8Array(init.body) : init.body,
          }).catch((retryError: unknown) => {
            if (isCommunityFetchNetworkError(retryError)) {
              throw new CommunityHttpError(
                humanizeCommunityFetchError(retryError),
                0,
                'HUB_CONNECTION_FAILED',
              )
            }
            throw retryError
          })
          const retryText = await retryResponse.text()
          return parseCommunityApiResponse<T>(retryText, retryResponse.status)
        }
        throw error
      }
    } finally {
      releaseCommunityRequestSlot()
    }
  }

  private async applyAuthHeaders(headers: Headers): Promise<void> {
    const auth = this.resolveAuth
      ? await Promise.resolve(this.resolveAuth())
      : { identityId: this.identityId }

    headers.set(COMMUNITY_HUB_HEADER, auth.identityId)

    if (auth.authorization && !this.skipBearer) {
      headers.set('Authorization', auth.authorization)
    }
  }
}
