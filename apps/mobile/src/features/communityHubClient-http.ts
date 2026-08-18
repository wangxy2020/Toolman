/**
 * Community Hub HTTP primitives for mobile.
 */

import { Platform } from 'react-native'
import {
  hostnameOfBaseUrl,
  isLoopbackHostname,
  isOfficialCommunityHubHost,
} from '@toolman/shared'
import { isHostedWebPage, pageHostname } from '../sync/desktopDevHost'

const COMMUNITY_HUB_PROXY_PREFIX = '/api/community-hub'

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/** Expo web talks to the desktop sidecar through a same-origin proxy to avoid CORS.
 * Hosted HTTPS pages must hit loopback directly — the Vercel proxy is not the user's desktop.
 */
function shouldUseCommunityHubProxy(baseUrl: string): boolean {
  if (Platform.OS !== 'web') return false
  const host = hostnameOfBaseUrl(baseUrl)
  if (!host) return false
  if (isLoopbackHostname(host)) return !isHostedWebPage()
  if (isOfficialCommunityHubHost(host) && isHostedWebPage()) return true
  const pageHost = pageHostname()
  return Boolean(pageHost) && pageHost === host
}

export function communityHubRequestUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (shouldUseCommunityHubProxy(baseUrl)) {
    return `${COMMUNITY_HUB_PROXY_PREFIX}${normalizedPath}`
  }
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`
}

function hubNetworkError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (/Failed to fetch|NetworkError|Load failed|abort/i.test(message)) {
    return new Error('无法连接社区 Hub')
  }
  return error instanceof Error ? error : new Error(message)
}

/** Bind fetch to the global object — Expo Web throws Illegal invocation on unbound Window.fetch. */
const hubFetch: typeof fetch = (input, init) => globalThis.fetch.bind(globalThis)(input, init)

function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function toSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function mapKeys(value: unknown, keyFn: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, keyFn))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        keyFn(key),
        mapKeys(nested, keyFn),
      ]),
    )
  }
  return value
}

type HubAuth = {
  userId?: string | null
}

function hubHeaders(auth?: HubAuth): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (auth?.userId) headers['X-Community-User-Id'] = auth.userId
  return headers
}

async function parseHubResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let payload: { ok?: boolean; data?: T; error?: { message?: string } }
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {}
  } catch {
    throw new Error(`Hub 返回无效 JSON (${res.status})`)
  }
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? `Hub 请求失败 (${res.status})`)
  }
  return mapKeys(payload.data, toCamelKey) as T
}

export async function hubGet<T>(baseUrl: string, path: string, auth?: HubAuth): Promise<T> {
  try {
    const res = await hubFetch(communityHubRequestUrl(baseUrl, path), {
      method: 'GET',
      headers: hubHeaders(auth),
    })
    return await parseHubResponse<T>(res)
  } catch (error) {
    throw hubNetworkError(error)
  }
}

export async function hubSend<T>(
  baseUrl: string,
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  auth?: HubAuth,
  body?: Record<string, unknown>,
): Promise<T> {
  const headers = hubHeaders(auth)
  if (body) headers['Content-Type'] = 'application/json'
  try {
    const res = await hubFetch(communityHubRequestUrl(baseUrl, path), {
      method,
      headers,
      body: body ? JSON.stringify(mapKeys(body, toSnakeKey)) : undefined,
    })
    return await parseHubResponse<T>(res)
  } catch (error) {
    throw hubNetworkError(error)
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function unwrapItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const rec = asRecord(data)
  if (rec && Array.isArray(rec.items)) return rec.items
  return []
}

export function requireUserId(userId?: string | null): string {
  const id = userId?.trim()
  if (!id) throw new Error('请先登录后再发布')
  return id
}

export function isCommunityHubHealthBody(text: string): boolean {
  if (!text.trim()) return false
  try {
    const payload = JSON.parse(text) as { ok?: boolean }
    return payload.ok !== false
  } catch {
    return false
  }
}

export async function probeCommunityHub(baseUrl: string): Promise<boolean> {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return false
  const probe = async (path: string): Promise<boolean> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2500)
    try {
      const res = await hubFetch(communityHubRequestUrl(base, path), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      })
      if (!res.ok) return false
      const text = await res.text()
      return isCommunityHubHealthBody(text)
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }
  if (await probe('/health')) return true
  return probe('/api/v1/health')
}

