import type {
  CommunityHubHealth,
  CommunityNewsSource,
  CommunityResourceType,
  CommunityTaskType,
  FederationPeeringInfo,
} from './communityHubClient-types'
import {
  asBool,
  asNumber,
  asRecord,
  asString,
  hubGet,
  hubSend,
  normalizeBaseUrl,
  requireUserId,
  unwrapItems,
} from './communityHubClient-http'

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
