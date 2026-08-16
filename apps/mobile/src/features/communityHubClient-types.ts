/**
 * Community Hub shared list/DTO types for mobile.
 */

export type CommunityCardIconKind =
  | 'news'
  | 'messages'
  | 'knowledge'
  | 'mcp'
  | 'skill'
  | 'workflow'
  | 'tasks'

export type CommunityListItem = {
  id: string
  title: string
  meta: string
  description: string
  createdAt: number
  likeCount: number
  dislikeCount: number
  favoriteCount: number
  commentCount: number
  installCount?: number
  coverUrl?: string | null
  iconKind: CommunityCardIconKind
  /** Full text for message / resource detail (not truncated). */
  body?: string
  /** News article original URL. */
  link?: string | null
  /** Raw HTML body when available from Hub list/detail. */
  contentHtml?: string
  summary?: string
  likedByMe?: boolean
  dislikedByMe?: boolean
  favoritedByMe?: boolean
}

export type CommunityCommentItem = {
  id: string
  userId: string
  authorName: string
  body: string
  createdAt: number
}

export type CommunityReportReason = 'spam' | 'illegal' | 'copyright' | 'other'

export type CommunityReportTargetType = 'resource' | 'news' | 'comment' | 'user' | 'task'

export type CommunityInteractionKind = 'like' | 'dislike' | 'favorite'

export type CommunityInteractionResult = {
  likeCount?: number
  dislikeCount?: number
  favoriteCount?: number
  likedByMe?: boolean
  dislikedByMe?: boolean
  favoritedByMe?: boolean
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

export type CommunityHubHealth = {
  status: string
  version: string
  dataDir: string
  userCount: number
  resourceCount: number
  federationPeering: boolean
}

export type FederationPeeringInfo = {
  baseUrl: string
  version: string
  resourceCount: number
  latestUpdatedAt: number | null
  federationPeering: boolean
}
