import {
  formatBoardMessageTitle,
  formatCommunityDate,
  formatCommunityDateTime,
  formatNewsPreview,
  formatTaskBudget,
  formatTaskStatusLabel,
  formatTaskTypeLabel,
  joinCommunityMeta,
} from './communityListFormat'
import type { CommunityCardIconKind, CommunityListItem } from './communityHubClient-types'
import {
  asNumber,
  asRecord,
  asString,
  hubGet,
  normalizeBaseUrl,
  unwrapItems,
} from './communityHubClient-http'

function mapEngagement(item: Record<string, unknown>) {
  return {
    likeCount: asNumber(item.likeCount),
    dislikeCount: asNumber(item.dislikeCount),
    favoriteCount: asNumber(item.favoriteCount),
    commentCount: asNumber(item.commentCount ?? item.replyCount),
    likedByMe: typeof item.likedByMe === 'boolean' ? item.likedByMe : undefined,
    dislikedByMe: typeof item.dislikedByMe === 'boolean' ? item.dislikedByMe : undefined,
    favoritedByMe: typeof item.favoritedByMe === 'boolean' ? item.favoritedByMe : undefined,
  }
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
    const contentHtml = asString(item.contentHtml)
    const link = asString(item.link) || null
    return {
      id: asString(item.id, `news-${index}`),
      title,
      meta: joinCommunityMeta([asString(item.sourceTitle), formatCommunityDateTime(publishedAt)]),
      description: formatNewsPreview(contentHtml || summary || title),
      createdAt: publishedAt,
      ...mapEngagement(item),
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : null,
      iconKind: 'news' as const,
      summary: summary || undefined,
      contentHtml: contentHtml || undefined,
      link,
    }
  })
}

export async function fetchCommunityNewsArticle(
  baseUrl: string,
  articleId: string,
  userId?: string | null,
): Promise<CommunityListItem> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet<unknown>(
    base,
    `/api/v1/news/articles/${encodeURIComponent(articleId)}`,
    { userId },
  )
  const item = asRecord(data) ?? {}
  const publishedAt = asNumber(item.publishedAt, Date.now())
  const title = asString(item.title, '未命名资讯')
  const summary = asString(item.summary)
  const contentHtml = asString(item.contentHtml)
  const link = asString(item.link) || null
  const author = asString(item.author)
  return {
    id: asString(item.id, articleId),
    title,
    meta: joinCommunityMeta([
      asString(item.sourceTitle),
      author,
      formatCommunityDateTime(publishedAt),
    ]),
    description: formatNewsPreview(contentHtml || summary || title),
    createdAt: publishedAt,
    ...mapEngagement(item),
    coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : null,
    iconKind: 'news',
    summary: summary || undefined,
    contentHtml: contentHtml || undefined,
    body: contentHtml ? undefined : summary || undefined,
    link,
  }
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
    return {
      id: asString(item.id, `msg-${index}`),
      title: formatBoardMessageTitle(body),
      meta: joinCommunityMeta([authorName, formatCommunityDateTime(createdAt)]),
      description: formatNewsPreview(body),
      createdAt,
      ...mapEngagement(item),
      iconKind: 'messages' as const,
      body,
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
    const updatedAt = asNumber(item.updatedAt, createdAt)
    const author = asRecord(item.author) ?? asRecord(item.publisher)
    const authorName = asString(author?.displayName, '社区')
    const version = asString(item.version)
    const installCount = asNumber(item.installCount ?? item.downloadCount)
    const iconKind: CommunityCardIconKind =
      resourceType === 'mcp' || resourceType === 'skill' || resourceType === 'workflow'
        ? resourceType
        : 'knowledge'
    return {
      id: asString(item.id, `res-${index}`),
      title,
      meta: joinCommunityMeta([
        version ? `v${version}` : '',
        authorName,
        formatCommunityDate(updatedAt),
      ]),
      description: formatNewsPreview(description),
      createdAt,
      ...mapEngagement(item),
      installCount,
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : null,
      iconKind,
      body: description || undefined,
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
    const publisher = asRecord(item.publisher) ?? asRecord(item.author)
    return {
      id: asString(item.id, `task-${index}`),
      title,
      meta: joinCommunityMeta([
        formatTaskStatusLabel(status),
        formatTaskTypeLabel(taskType),
        formatTaskBudget(asNumber(item.budgetAmount), asString(item.budgetCurrency, 'CNY')),
        asString(publisher?.displayName),
        formatCommunityDateTime(createdAt),
      ]),
      description: formatNewsPreview(description),
      createdAt,
      ...mapEngagement(item),
      iconKind: 'tasks' as const,
      body: description || undefined,
    }
  })
}

