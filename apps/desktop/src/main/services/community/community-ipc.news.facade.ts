import {
  CommunityNewsInteractionInputSchema,
  CommunityNewsInteractionOutputSchema,
  CommunityNewsCommentCreateInputSchema,
  CommunityNewsCommentListInputSchema,
  CommunityNewsCommentListOutputSchema,
  CommunityNewsCommentSchema,
  CommunityNewsListInputSchema,
  CommunityNewsListOutputSchema,
  CommunityNewsArticleSchema,
  CommunityNewsGetInputSchema,
  CommunityNewsRecommendedOutputSchema,
  CommunityNewsSourceCreateInputSchema,
  CommunityNewsSourceDeleteInputSchema,
  CommunityNewsSourceFetchInputSchema,
  CommunityNewsSourceListOutputSchema,
  CommunityNewsSourceSchema,
} from '@toolman/shared'

import { buildApiQuery, fromApiJson, toApiJson } from './community-case'
import { asItems, requireClient } from './community-ipc.facade-core'

export async function listNewsSources() {
  const client = requireClient()
  const data = await client.get<unknown[]>('/api/v1/news/sources', { authenticated: false })
  return CommunityNewsSourceListOutputSchema.parse({ items: asItems(data) })
}

export async function createNewsSource(input: unknown) {
  const parsed = CommunityNewsSourceCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/news/sources', toApiJson(parsed))
  return CommunityNewsSourceSchema.parse(fromApiJson(data))
}

export async function deleteNewsSource(input: unknown) {
  const parsed = CommunityNewsSourceDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/news/sources/${parsed.sourceId}`)
  return { deleted: true as const }
}

export async function fetchNewsSource(input: unknown) {
  const parsed = CommunityNewsSourceFetchInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/news/sources/${parsed.sourceId}/fetch`)
  return fromApiJson(data)
}

export async function listNewsArticles(input: unknown) {
  const parsed = CommunityNewsListInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    category: parsed.category,
    source_id: parsed.sourceId,
    q: parsed.q,
    sort: parsed.sort,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/news/articles${query}`)
  return CommunityNewsListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityNewsArticleSchema.parse(fromApiJson(item))),
  })
}

export async function getNewsArticle(input: unknown) {
  const parsed = CommunityNewsGetInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown>(`/api/v1/news/articles/${parsed.id}`)
  return CommunityNewsArticleSchema.parse(fromApiJson(data))
}

export async function listRecommendedNews() {
  const client = requireClient()
  const data = await client.get<unknown[]>('/api/v1/news/articles/recommended')
  return CommunityNewsRecommendedOutputSchema.parse({
    items: asItems(data).map((item) => CommunityNewsArticleSchema.parse(fromApiJson(item))),
  })
}

export async function favoriteNewsArticle(input: unknown) {
  const parsed = CommunityNewsInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/news/articles/${parsed.articleId}/favorite`)
  return CommunityNewsInteractionOutputSchema.parse(fromApiJson(data))
}

export async function likeNewsArticle(input: unknown) {
  const parsed = CommunityNewsInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/news/articles/${parsed.articleId}/like`)
  return CommunityNewsInteractionOutputSchema.parse(fromApiJson(data))
}

export async function dislikeNewsArticle(input: unknown) {
  const parsed = CommunityNewsInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/news/articles/${parsed.articleId}/dislike`)
  return CommunityNewsInteractionOutputSchema.parse(fromApiJson(data))
}

export async function listNewsComments(input: unknown) {
  const parsed = CommunityNewsCommentListInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(
    `/api/v1/news/articles/${parsed.articleId}/comments${query}`,
    { authenticated: false },
  )
  return CommunityNewsCommentListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityNewsCommentSchema.parse(fromApiJson(item))),
  })
}

export async function createNewsComment(input: unknown) {
  const parsed = CommunityNewsCommentCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/news/articles/${parsed.articleId}/comments`,
    toApiJson({
      body: parsed.body,
      parentId: parsed.parentId ?? null,
    }),
  )
  return CommunityNewsCommentSchema.parse(fromApiJson(data))
}
