/**
 * Community Hub interaction APIs (like / dislike / favorite / comments / report).
 */
import type {
  CommunityCommentItem,
  CommunityInteractionKind,
  CommunityInteractionResult,
  CommunityReportReason,
  CommunityReportTargetType,
} from './communityHubClient-types'
import {
  asNumber,
  asRecord,
  asString,
  hubGet,
  hubSend,
  normalizeBaseUrl,
  requireUserId,
  unwrapItems,
} from './communityHubClient-http'

export type CommunityCommentTarget = {
  targetType: 'news' | 'resource' | 'board' | 'task'
  targetId: string
  parentId?: string | null
}

export const COMMUNITY_BOARD_MAIN_ID = 'main'

export function buildNewsCommentTarget(articleId: string): CommunityCommentTarget {
  return { targetType: 'news', targetId: articleId }
}

export function buildBoardReplyTarget(messageId: string): CommunityCommentTarget {
  return {
    targetType: 'board',
    targetId: COMMUNITY_BOARD_MAIN_ID,
    parentId: messageId,
  }
}

export function buildResourceCommentTarget(resourceId: string): CommunityCommentTarget {
  return { targetType: 'resource', targetId: resourceId }
}

function parseOptionalBool(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') return value
  }
  return undefined
}

function parseInteractionResult(data: unknown): CommunityInteractionResult {
  const item = asRecord(data) ?? {}
  return {
    likeCount: typeof item.likeCount === 'number' ? item.likeCount : undefined,
    dislikeCount: typeof item.dislikeCount === 'number' ? item.dislikeCount : undefined,
    favoriteCount: typeof item.favoriteCount === 'number' ? item.favoriteCount : undefined,
    likedByMe: parseOptionalBool(item.likedByMe, item.liked),
    dislikedByMe: parseOptionalBool(item.dislikedByMe, item.disliked),
    favoritedByMe: parseOptionalBool(item.favoritedByMe, item.favorited),
  }
}

function interactionPath(
  listKind: string,
  itemId: string,
  kind: CommunityInteractionKind,
): string {
  const id = encodeURIComponent(itemId)
  if (listKind === 'news') return `/api/v1/news/articles/${id}/${kind}`
  if (listKind === 'messages') return `/api/v1/board/messages/${id}/${kind}`
  if (listKind === 'market') return `/api/v1/marketplace/resources/${id}/${kind}`
  throw new Error('当前栏目暂不支持该互动')
}

export async function toggleCommunityInteraction(
  baseUrl: string,
  input: { listKind: string; itemId: string; kind: CommunityInteractionKind },
  userId?: string | null,
): Promise<CommunityInteractionResult> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubSend(
    base,
    interactionPath(input.listKind, input.itemId, input.kind),
    'POST',
    { userId: requireUserId(userId) },
  )
  return parseInteractionResult(data)
}

function commentQuery(target: CommunityCommentTarget): string {
  const params = new URLSearchParams({
    target_type: target.targetType,
    target_id: target.targetId,
    limit: '100',
  })
  if (target.parentId) params.set('parent_id', target.parentId)
  return `?${params.toString()}`
}

function mapComment(raw: unknown, index: number): CommunityCommentItem {
  const item = asRecord(raw) ?? {}
  const author = asRecord(item.author)
  return {
    id: asString(item.id, `cmt-${index}`),
    userId: asString(item.userId),
    authorName: asString(author?.displayName, '匿名'),
    body: asString(item.body),
    createdAt: asNumber(item.createdAt, Date.now() - index),
  }
}

export async function listCommunityComments(
  baseUrl: string,
  target: CommunityCommentTarget,
  userId?: string | null,
): Promise<CommunityCommentItem[]> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubGet(base, `/api/v1/comments${commentQuery(target)}`, { userId })
  return unwrapItems(data).map(mapComment)
}

export async function createCommunityComment(
  baseUrl: string,
  target: CommunityCommentTarget,
  body: string,
  userId?: string | null,
): Promise<CommunityCommentItem> {
  const base = normalizeBaseUrl(baseUrl)
  const data = await hubSend(
    base,
    '/api/v1/comments',
    'POST',
    { userId: requireUserId(userId) },
    {
      targetType: target.targetType,
      targetId: target.targetId,
      body,
      parentId: target.parentId ?? null,
    },
  )
  return mapComment(data, 0)
}

export async function deleteCommunityComment(
  baseUrl: string,
  commentId: string,
  userId?: string | null,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl)
  await hubSend(
    base,
    `/api/v1/comments/${encodeURIComponent(commentId)}`,
    'DELETE',
    { userId: requireUserId(userId) },
  )
}

export async function createCommunityModerationReport(
  baseUrl: string,
  input: {
    targetType: CommunityReportTargetType
    targetId: string
    reason: CommunityReportReason
    description?: string
  },
  userId?: string | null,
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl)
  await hubSend(
    base,
    '/api/v1/moderation/reports',
    'POST',
    { userId: requireUserId(userId) },
    {
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      description: input.description?.trim() || undefined,
    },
  )
}

export function resolveCommentTarget(
  listKind: string,
  itemId: string,
): CommunityCommentTarget | null {
  if (listKind === 'news') return buildNewsCommentTarget(itemId)
  if (listKind === 'messages') return buildBoardReplyTarget(itemId)
  if (listKind === 'market') return buildResourceCommentTarget(itemId)
  return null
}

export function resolveReportTarget(
  listKind: string,
  itemId: string,
): { targetType: CommunityReportTargetType; targetId: string } | null {
  if (listKind === 'news') return { targetType: 'news', targetId: itemId }
  if (listKind === 'messages') return { targetType: 'comment', targetId: itemId }
  if (listKind === 'market') return { targetType: 'resource', targetId: itemId }
  if (listKind === 'tasks') return { targetType: 'task', targetId: itemId }
  return null
}

export function applyInteractionToItem<T extends {
  likeCount: number
  dislikeCount: number
  favoriteCount: number
  likedByMe?: boolean
  dislikedByMe?: boolean
  favoritedByMe?: boolean
}>(item: T, result: CommunityInteractionResult): T {
  return {
    ...item,
    likeCount: typeof result.likeCount === 'number' ? result.likeCount : item.likeCount,
    dislikeCount:
      typeof result.dislikeCount === 'number' ? result.dislikeCount : item.dislikeCount,
    favoriteCount:
      typeof result.favoriteCount === 'number' ? result.favoriteCount : item.favoriteCount,
    likedByMe: typeof result.likedByMe === 'boolean' ? result.likedByMe : item.likedByMe,
    dislikedByMe:
      typeof result.dislikedByMe === 'boolean' ? result.dislikedByMe : item.dislikedByMe,
    favoritedByMe:
      typeof result.favoritedByMe === 'boolean' ? result.favoritedByMe : item.favoritedByMe,
  }
}
