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
