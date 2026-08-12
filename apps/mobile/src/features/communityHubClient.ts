/**
 * Lightweight Community Hub HTTP client for mobile list views.
 * Desktop uses Electron IPC → Hub; mobile hits Hub Base URL when configured.
 */

export type CommunityListItem = {
  id: string
  title: string
  meta: string
  description: string
  createdAt: number
  sizeBytes: number
  likeCount: number
  dislikeCount: number
  favoriteCount: number
  commentCount: number
  installCount?: number
  coverUrl?: string | null
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

async function hubGet<T>(baseUrl: string, path: string, userId?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (userId) headers['X-Community-User-Id'] = userId

  const res = await fetch(`${baseUrl}${path}`, { method: 'GET', headers })
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
  return payload.data as T
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

export async function probeCommunityHub(baseUrl: string): Promise<boolean> {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return false
  try {
    await hubGet(base, '/health')
    return true
  } catch {
    try {
      await hubGet(base, '/api/v1/health')
      return true
    } catch {
      return false
    }
  }
}

export async function fetchCommunityNews(
  baseUrl: string,
  userId?: string | null,
): Promise<CommunityListItem[]> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet(base, '/api/v1/news/articles?sort=diverse&limit=30', userId)
  return unwrapItems(data).map((raw, index) => {
    const item = asRecord(raw) ?? {}
    const publishedAt = asNumber(item.publishedAt, Date.now() - index)
    const title = asString(item.title, '未命名资讯')
    const summary = asString(item.summary)
    return {
      id: asString(item.id, `news-${index}`),
      title,
      meta: [asString(item.sourceTitle), formatDate(publishedAt)].filter(Boolean).join(' · '),
      description: summary,
      createdAt: publishedAt,
      sizeBytes: summary.length || title.length,
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
  const data = await hubGet(base, '/api/v1/board/messages?limit=50', userId)
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
      meta: `${authorName} · ${formatDate(createdAt)}`,
      description: body,
      createdAt,
      sizeBytes: body.length,
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
    `/api/v1/resources?resource_type=${encodeURIComponent(resourceType)}&sort=installs&limit=50`,
    userId,
  )
  return unwrapItems(data).map((raw, index) => {
    const item = asRecord(raw) ?? {}
    const title = asString(item.title, '未命名资源')
    const description = asString(item.description)
    const createdAt = asNumber(item.createdAt, Date.now() - index)
    const author = asRecord(item.author)
    const authorName = asString(author?.displayName, '社区')
    const version = asString(item.version)
    return {
      id: asString(item.id, `res-${index}`),
      title,
      meta: [authorName, version ? `v${version}` : '', formatDate(createdAt)]
        .filter(Boolean)
        .join(' · '),
      description,
      createdAt,
      sizeBytes: asNumber(item.resourceSize, description.length),
      likeCount: asNumber(item.likeCount),
      dislikeCount: asNumber(item.dislikeCount),
      favoriteCount: asNumber(item.favoriteCount),
      commentCount: asNumber(item.commentCount),
      installCount: asNumber(item.installCount ?? item.downloadCount),
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : null,
    }
  })
}

export async function fetchCommunityTasks(
  baseUrl: string,
  userId?: string | null,
): Promise<CommunityListItem[]> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet(base, '/api/v1/tasks?limit=50', userId)
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
      meta: [taskType, status, formatDate(createdAt)].filter(Boolean).join(' · '),
      description,
      createdAt,
      sizeBytes: description.length || title.length,
      likeCount: asNumber(item.likeCount),
      dislikeCount: asNumber(item.dislikeCount),
      favoriteCount: asNumber(item.favoriteCount),
      commentCount: asNumber(item.commentCount),
    }
  })
}
