/**
 * Lightweight Community Hub HTTP client for mobile list views and publish.
 * Desktop uses Electron IPC → Hub; mobile hits Hub Base URL (default local sidecar).
 */

import { Platform } from 'react-native'
import { hostnameOfBaseUrl, isLoopbackHostname } from '@toolman/shared'

export type CommunityInfoRow = {
  label: string
  value: string
}

export type CommunityListItem = {
  id: string
  title: string
  infoRows: CommunityInfoRow[]
  description: string
  createdAt: number
  likeCount: number
  dislikeCount: number
  favoriteCount: number
  commentCount: number
  installCount?: number
  coverUrl?: string | null
}

export type CommunityNewsSource = {
  id: string
  title: string
  feedUrl: string
  enabled: boolean
  fetchIntervalMinutes: number
  lastFetchedAt: number | null
  lastError: string | null
}

export type CommunityTaskType = 'development' | 'design' | 'translation' | 'tender' | 'other'

export type CommunityResourceType = 'knowledge' | 'mcp' | 'skill' | 'workflow'

const COMMUNITY_HUB_PROXY_PREFIX = '/api/community-hub'

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function pageHostname(): string {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) return ''
  return (globalThis as { location?: { hostname?: string } }).location?.hostname ?? ''
}

/** Expo web talks to the desktop sidecar through a same-origin Metro proxy to avoid CORS. */
function shouldUseCommunityHubProxy(baseUrl: string): boolean {
  if (Platform.OS !== 'web') return false
  const host = hostnameOfBaseUrl(baseUrl)
  if (!host) return false
  if (isLoopbackHostname(host)) return true
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

async function hubGet<T>(baseUrl: string, path: string, auth?: HubAuth): Promise<T> {
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

async function hubSend<T>(
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function unwrapItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const rec = asRecord(data)
  if (rec && Array.isArray(rec.items)) return rec.items
  return []
}

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function infoRows(rows: Array<[string, string]>): CommunityInfoRow[] {
  return rows
    .map(([label, value]) => ({ label, value: value.trim() }))
    .filter((row) => row.value.length > 0)
}

const TASK_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  open: '开放',
  assigned: '已指派',
  in_progress: '进行中',
  delivered: '已交付',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝',
  closed: '已关闭',
}

function requireUserId(userId?: string | null): string {
  const id = userId?.trim()
  if (!id) throw new Error('请先登录后再发布')
  return id
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
      if (!text) return res.ok
      try {
        const payload = JSON.parse(text) as { ok?: boolean }
        return payload.ok !== false
      } catch {
        return true
      }
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }
  if (await probe('/health')) return true
  return probe('/api/v1/health')
}

export async function fetchCommunityNews(
  baseUrl: string,
  userId?: string | null,
): Promise<CommunityListItem[]> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet(base, '/api/v1/news/articles?sort=diverse&limit=30', { userId })
  return unwrapItems(data).map((raw, index) => {
    const item = asRecord(raw) ?? {}
    const publishedAt = asNumber(item.publishedAt, Date.now() - index)
    const title = asString(item.title, '未命名资讯')
    const summary = asString(item.summary)
    return {
      id: asString(item.id, `news-${index}`),
      title,
      infoRows: infoRows([
        ['来源', asString(item.sourceTitle)],
        ['发布日期', formatDate(publishedAt)],
      ]),
      description: summary,
      createdAt: publishedAt,
      likeCount: asNumber(item.likeCount),
      dislikeCount: asNumber(item.dislikeCount),
      favoriteCount: asNumber(item.favoriteCount),
      commentCount: asNumber(item.commentCount),
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : null,
    }
  })
}

export async function fetchCommunityMessages(
  baseUrl: string,
  userId?: string | null,
): Promise<CommunityListItem[]> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet(base, '/api/v1/board/messages?limit=50', { userId })
  return unwrapItems(data).map((raw, index) => {
    const item = asRecord(raw) ?? {}
    const body = asString(item.body)
    const createdAt = asNumber(item.createdAt, Date.now() - index)
    const author = asRecord(item.author)
    const authorName = asString(author?.displayName, '匿名')
    const title = body.trim().slice(0, 48) || '留言'
    return {
      id: asString(item.id, `msg-${index}`),
      title,
      infoRows: infoRows([
        ['作者', authorName],
        ['发布日期', formatDate(createdAt)],
      ]),
      description: body,
      createdAt,
      likeCount: asNumber(item.likeCount),
      dislikeCount: asNumber(item.dislikeCount),
      favoriteCount: asNumber(item.favoriteCount),
      commentCount: asNumber(item.commentCount ?? item.replyCount),
    }
  })
}

export async function fetchCommunityResources(
  baseUrl: string,
  resourceType: string,
  userId?: string | null,
): Promise<CommunityListItem[]> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet(
    base,
    `/api/v1/marketplace/resources?resource_type=${encodeURIComponent(resourceType)}&sort=installs&limit=50`,
    { userId },
  )
  return unwrapItems(data).map((raw, index) => {
    const item = asRecord(raw) ?? {}
    const title = asString(item.title, '未命名资源')
    const description = asString(item.description)
    const createdAt = asNumber(item.createdAt, Date.now() - index)
    const author = asRecord(item.author) ?? asRecord(item.publisher)
    const authorName = asString(author?.displayName, '社区')
    const version = asString(item.version)
    const installCount = asNumber(item.installCount ?? item.downloadCount)
    return {
      id: asString(item.id, `res-${index}`),
      title,
      infoRows: infoRows([
        ['作者', authorName],
        ['版本', version ? `v${version}` : ''],
        ['发布日期', formatDate(createdAt)],
        ['安装', installCount > 0 ? String(installCount) : ''],
      ]),
      description,
      createdAt,
      likeCount: asNumber(item.likeCount),
      dislikeCount: asNumber(item.dislikeCount),
      favoriteCount: asNumber(item.favoriteCount),
      commentCount: asNumber(item.commentCount),
      installCount,
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : null,
    }
  })
}

export async function fetchCommunityTasks(
  baseUrl: string,
  userId?: string | null,
): Promise<CommunityListItem[]> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet(base, '/api/v1/tasks?limit=50', { userId })
  return unwrapItems(data).map((raw, index) => {
    const item = asRecord(raw) ?? {}
    const title = asString(item.title, '未命名任务')
    const description = asString(item.description)
    const createdAt = asNumber(item.createdAt, Date.now() - index)
    const status = asString(item.status, 'open')
    const taskType = asString(item.taskType ?? item.type, '')
    return {
      id: asString(item.id, `task-${index}`),
      title,
      infoRows: infoRows([
        ['类型', taskType],
        ['状态', TASK_STATUS_LABEL[status] ?? status],
        ['发布日期', formatDate(createdAt)],
      ]),
      description,
      createdAt,
      likeCount: asNumber(item.likeCount),
      dislikeCount: asNumber(item.dislikeCount),
      favoriteCount: asNumber(item.favoriteCount),
      commentCount: asNumber(item.commentCount),
    }
  })
}

export async function createCommunityBoardMessage(
  baseUrl: string,
  input: { body: string; parentId?: string | null },
  userId?: string | null,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl)
  await hubSend(base, '/api/v1/board/messages', 'POST', { userId: requireUserId(userId) }, {
    body: input.body,
    parentId: input.parentId ?? null,
  })
}

export async function createCommunityTask(
  baseUrl: string,
  input: {
    title: string
    description?: string
    taskType: CommunityTaskType
    budgetAmount?: number
    budgetCurrency?: string
    deadlineAt?: number | null
    tags?: string[]
  },
  userId?: string | null,
): Promise<{ id: string }> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubSend<Record<string, unknown>>(
    base,
    '/api/v1/tasks',
    'POST',
    { userId: requireUserId(userId) },
    {
      title: input.title,
      description: input.description ?? '',
      taskType: input.taskType,
      budgetAmount: input.budgetAmount ?? 0,
      budgetCurrency: input.budgetCurrency ?? 'CNY',
      deadlineAt: input.deadlineAt ?? null,
      tags: input.tags ?? [],
    },
  )
  const id = asString(data.id)
  if (!id) throw new Error('Hub 未返回任务 ID')
  return { id }
}

export async function publishCommunityTask(
  baseUrl: string,
  taskId: string,
  userId?: string | null,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl)
  await hubSend(base, `/api/v1/tasks/${encodeURIComponent(taskId)}/publish`, 'POST', {
    userId: requireUserId(userId),
  })
}

export async function createCommunityResource(
  baseUrl: string,
  input: {
    title: string
    description?: string
    resourceType: CommunityResourceType
    tags?: string[]
    category?: string
    license?: string
  },
  userId?: string | null,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl)
  await hubSend(
    base,
    '/api/v1/marketplace/resources',
    'POST',
    { userId: requireUserId(userId) },
    {
      title: input.title,
      description: input.description ?? '',
      resourceType: input.resourceType,
      tags: input.tags ?? [],
      category: input.category ?? '',
      license: input.license ?? 'MIT',
    },
  )
}

export async function listCommunityNewsSources(
  baseUrl: string,
  userId?: string | null,
): Promise<CommunityNewsSource[]> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet(base, '/api/v1/news/sources', { userId })
  return unwrapItems(data).map((raw, index) => {
    const item = asRecord(raw) ?? {}
    return {
      id: asString(item.id, `src-${index}`),
      title: asString(item.title, '未命名源'),
      feedUrl: asString(item.feedUrl),
      enabled: asBool(item.enabled, true),
      fetchIntervalMinutes: asNumber(item.fetchIntervalMinutes, 30),
      lastFetchedAt: asNumber(item.lastFetchedAt) || null,
      lastError: asString(item.lastError) || null,
    }
  })
}

export async function createCommunityNewsSource(
  baseUrl: string,
  input: { title: string; feedUrl: string; fetchIntervalMinutes?: number },
  userId?: string | null,
): Promise<CommunityNewsSource> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubSend<Record<string, unknown>>(
    base,
    '/api/v1/news/sources',
    'POST',
    { userId: requireUserId(userId) },
    {
      title: input.title,
      feedUrl: input.feedUrl,
      category: 'general',
      fetchIntervalMinutes: input.fetchIntervalMinutes ?? 30,
    },
  )
  return {
    id: asString(data.id),
    title: asString(data.title, input.title),
    feedUrl: asString(data.feedUrl, input.feedUrl),
    enabled: asBool(data.enabled, true),
    fetchIntervalMinutes: asNumber(data.fetchIntervalMinutes, input.fetchIntervalMinutes ?? 30),
    lastFetchedAt: asNumber(data.lastFetchedAt) || null,
    lastError: asString(data.lastError) || null,
  }
}

export async function fetchCommunityNewsSource(
  baseUrl: string,
  sourceId: string,
  userId?: string | null,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl)
  await hubSend(
    base,
    `/api/v1/news/sources/${encodeURIComponent(sourceId)}/fetch`,
    'POST',
    { userId: requireUserId(userId) },
  )
}

export async function deleteCommunityNewsSource(
  baseUrl: string,
  sourceId: string,
  userId?: string | null,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl)
  await hubSend(
    base,
    `/api/v1/news/sources/${encodeURIComponent(sourceId)}`,
    'DELETE',
    { userId: requireUserId(userId) },
  )
}

export type CommunityHubHealth = {
  status: string
  version: string
  dataDir: string
  userCount: number
  resourceCount: number
  federationPeering: boolean
}

export async function fetchCommunityHubHealth(baseUrl: string): Promise<CommunityHubHealth> {
  const data = await hubGet<Record<string, unknown>>(normalizeBaseUrl(baseUrl), '/api/v1/health')
  return {
    status: asString(data.status, 'unknown'),
    version: asString(data.version),
    dataDir: asString(data.dataDir),
    userCount: asNumber(data.userCount),
    resourceCount: asNumber(data.resourceCount),
    federationPeering: asBool(data.federationPeering),
  }
}

export type FederationPeeringInfo = {
  baseUrl: string
  version: string
  resourceCount: number
  latestUpdatedAt: number | null
  federationPeering: boolean
}

export async function fetchFederationPeering(baseUrl: string): Promise<FederationPeeringInfo> {
  const data = await hubGet<Record<string, unknown>>(
    normalizeBaseUrl(baseUrl),
    '/api/v1/federation/peering/info',
  )
  return {
    baseUrl: asString(data.baseUrl),
    version: asString(data.version),
    resourceCount: asNumber(data.resourceCount),
    latestUpdatedAt: typeof data.latestUpdatedAt === 'number' ? data.latestUpdatedAt : null,
    federationPeering: asBool(data.federationPeering),
  }
}

export async function fetchFederationCatalogCount(baseUrl: string): Promise<number> {
  const data = await hubGet<unknown>(
    normalizeBaseUrl(baseUrl),
    '/api/v1/federation/catalog?limit=100',
  )
  return unwrapItems(data).length
}
