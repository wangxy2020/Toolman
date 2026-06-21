import type {
  CommunityBoardMessage,
  CommunityNewsArticle,
  CommunityResourceItem,
} from '@toolman/shared'

import type {
  CommunityCardActionCounts,
  CommunityCardActionState,
} from './CommunityListCardActions'
import {
  COMMUNITY_UI_MOCK_ENABLED,
  COMMUNITY_UI_MOCK_IDS,
  isUiMockCommunityId,
} from './community-ui-mock'

export interface UiMockInteractionSnapshot {
  state: Required<CommunityCardActionState>
  counts: Required<Pick<CommunityCardActionCounts, 'likeCount' | 'dislikeCount' | 'favoriteCount'>>
}

const interactionStore = new Map<string, UiMockInteractionSnapshot>()

function normalize(
  state: CommunityCardActionState = {},
  counts: CommunityCardActionCounts = {},
): UiMockInteractionSnapshot {
  return {
    state: {
      liked: state.liked ?? false,
      disliked: state.disliked ?? false,
      favorited: state.favorited ?? false,
    },
    counts: {
      likeCount: counts.likeCount ?? 0,
      dislikeCount: counts.dislikeCount ?? 0,
      favoriteCount: counts.favoriteCount ?? 0,
    },
  }
}

export function getUiMockInteractionDefaults(id: string): UiMockInteractionSnapshot | null {
  if (!isUiMockCommunityId(id)) return null

  switch (id) {
    case COMMUNITY_UI_MOCK_IDS.resource:
      return normalize(
        {},
        { likeCount: 24, dislikeCount: 2, favoriteCount: 9 },
      )
    case COMMUNITY_UI_MOCK_IDS.news:
      return normalize(
        { liked: false, disliked: false, favorited: false },
        { likeCount: 18, dislikeCount: 1, favoriteCount: 6 },
      )
    case COMMUNITY_UI_MOCK_IDS.message:
      return normalize(
        { liked: false, disliked: false, favorited: false },
        { likeCount: 3, dislikeCount: 0, favoriteCount: 0 },
      )
    case COMMUNITY_UI_MOCK_IDS.task:
      return normalize(
        { liked: false, disliked: false, favorited: false },
        { likeCount: 8, dislikeCount: 1, favoriteCount: 3 },
      )
    default:
      return normalize()
  }
}

export function readUiMockInteraction(
  id: string,
  baseState: CommunityCardActionState = {},
  baseCounts: CommunityCardActionCounts = {},
): UiMockInteractionSnapshot | null {
  if (!COMMUNITY_UI_MOCK_ENABLED || !isUiMockCommunityId(id)) return null

  const defaults = getUiMockInteractionDefaults(id)
  const base = normalize(
    { ...defaults?.state, ...baseState },
    { ...defaults?.counts, ...baseCounts },
  )
  const stored = interactionStore.get(id)
  if (!stored) return base

  return {
    state: { ...base.state, ...stored.state },
    counts: { ...base.counts, ...stored.counts },
  }
}

export function writeUiMockInteraction(id: string, snapshot: UiMockInteractionSnapshot) {
  if (!COMMUNITY_UI_MOCK_ENABLED || !isUiMockCommunityId(id)) return
  interactionStore.set(id, snapshot)
}

function toggleLike(current: UiMockInteractionSnapshot): UiMockInteractionSnapshot {
  if (current.state.liked) {
    return {
      state: { ...current.state, liked: false },
      counts: {
        ...current.counts,
        likeCount: Math.max(0, current.counts.likeCount - 1),
      },
    }
  }

  return {
    state: { ...current.state, liked: true, disliked: false },
    counts: {
      ...current.counts,
      likeCount: current.counts.likeCount + 1,
      dislikeCount:
        current.state.disliked && current.counts.dislikeCount > 0
          ? current.counts.dislikeCount - 1
          : current.counts.dislikeCount,
    },
  }
}

function toggleDislike(current: UiMockInteractionSnapshot): UiMockInteractionSnapshot {
  if (current.state.disliked) {
    return {
      state: { ...current.state, disliked: false },
      counts: {
        ...current.counts,
        dislikeCount: Math.max(0, current.counts.dislikeCount - 1),
      },
    }
  }

  return {
    state: { ...current.state, disliked: true, liked: false },
    counts: {
      ...current.counts,
      dislikeCount: current.counts.dislikeCount + 1,
      likeCount:
        current.state.liked && current.counts.likeCount > 0
          ? current.counts.likeCount - 1
          : current.counts.likeCount,
    },
  }
}

function toggleFavorite(current: UiMockInteractionSnapshot): UiMockInteractionSnapshot {
  const favorited = !current.state.favorited
  return {
    state: { ...current.state, favorited },
    counts: {
      ...current.counts,
      favoriteCount: Math.max(0, current.counts.favoriteCount + (favorited ? 1 : -1)),
    },
  }
}

export function toggleUiMockLike(
  id: string,
  baseState: CommunityCardActionState = {},
  baseCounts: CommunityCardActionCounts = {},
): UiMockInteractionSnapshot | null {
  const current = readUiMockInteraction(id, baseState, baseCounts)
  if (!current) return null
  const next = toggleLike(current)
  writeUiMockInteraction(id, next)
  return next
}

export function toggleUiMockDislike(
  id: string,
  baseState: CommunityCardActionState = {},
  baseCounts: CommunityCardActionCounts = {},
): UiMockInteractionSnapshot | null {
  const current = readUiMockInteraction(id, baseState, baseCounts)
  if (!current) return null
  const next = toggleDislike(current)
  writeUiMockInteraction(id, next)
  return next
}

export function toggleUiMockFavorite(
  id: string,
  baseState: CommunityCardActionState = {},
  baseCounts: CommunityCardActionCounts = {},
): UiMockInteractionSnapshot | null {
  const current = readUiMockInteraction(id, baseState, baseCounts)
  if (!current) return null
  const next = toggleFavorite(current)
  writeUiMockInteraction(id, next)
  return next
}

export function applyUiMockInteractionToResource(item: CommunityResourceItem): CommunityResourceItem {
  const snapshot = readUiMockInteraction(item.id, {
    liked: item.likedByMe,
    disliked: item.dislikedByMe,
    favorited: item.favoritedByMe,
  }, {
    likeCount: item.likeCount,
    dislikeCount: item.dislikeCount,
    favoriteCount: item.favoriteCount,
  })
  if (!snapshot) return item

  return {
    ...item,
    likeCount: snapshot.counts.likeCount,
    dislikeCount: snapshot.counts.dislikeCount,
    favoriteCount: snapshot.counts.favoriteCount,
    likedByMe: snapshot.state.liked,
    dislikedByMe: snapshot.state.disliked,
    favoritedByMe: snapshot.state.favorited,
  }
}

export function applyUiMockInteractionToNews(item: CommunityNewsArticle): CommunityNewsArticle {
  const snapshot = readUiMockInteraction(item.id, {
    liked: item.likedByMe,
    disliked: item.dislikedByMe,
    favorited: item.favoritedByMe,
  }, {
    likeCount: item.likeCount,
    dislikeCount: item.dislikeCount,
    favoriteCount: item.favoriteCount,
  })
  if (!snapshot) return item

  return {
    ...item,
    likeCount: snapshot.counts.likeCount,
    dislikeCount: snapshot.counts.dislikeCount,
    favoriteCount: snapshot.counts.favoriteCount,
    likedByMe: snapshot.state.liked,
    dislikedByMe: snapshot.state.disliked,
    favoritedByMe: snapshot.state.favorited,
  }
}

export function applyUiMockInteractionToMessage(item: CommunityBoardMessage): CommunityBoardMessage {
  const snapshot = readUiMockInteraction(item.id, {
    liked: item.likedByMe,
    disliked: item.dislikedByMe,
    favorited: item.favoritedByMe,
  }, {
    likeCount: item.likeCount,
    dislikeCount: item.dislikeCount,
    favoriteCount: item.favoriteCount,
  })
  if (!snapshot) return item

  return {
    ...item,
    likeCount: snapshot.counts.likeCount,
    dislikeCount: snapshot.counts.dislikeCount,
    favoriteCount: snapshot.counts.favoriteCount,
    likedByMe: snapshot.state.liked,
    dislikedByMe: snapshot.state.disliked,
    favoritedByMe: snapshot.state.favorited,
  }
}

export function getUiMockResourceItemState(resourceId: string): CommunityCardActionState {
  const snapshot = readUiMockInteraction(resourceId)
  return snapshot?.state ?? {}
}
