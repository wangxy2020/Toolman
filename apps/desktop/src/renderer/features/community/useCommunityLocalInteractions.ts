import { useCallback, useReducer, useState } from 'react'

import type {
  CommunityCardActionCounts,
  CommunityCardActionState,
} from './CommunityListCardActions'
import { isUiMockCommunityId } from './community-ui-mock'
import {
  readUiMockInteraction,
  toggleUiMockDislike,
  toggleUiMockFavorite,
  toggleUiMockLike,
} from './community-ui-mock-interactions'

interface InteractionOverride {
  state: CommunityCardActionState
  counts: CommunityCardActionCounts
}

function withDefaults(
  state: CommunityCardActionState = {},
  counts: CommunityCardActionCounts = {},
): InteractionOverride {
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
      installCount: counts.installCount,
    },
  }
}

function toggleLike(current: InteractionOverride): InteractionOverride {
  if (current.state.liked) {
    return {
      state: { ...current.state, liked: false },
      counts: {
        ...current.counts,
        likeCount: Math.max(0, (current.counts.likeCount ?? 0) - 1),
      },
    }
  }

  return {
    state: { ...current.state, liked: true, disliked: false },
    counts: {
      ...current.counts,
      likeCount: (current.counts.likeCount ?? 0) + 1,
      dislikeCount:
        current.state.disliked && (current.counts.dislikeCount ?? 0) > 0
          ? (current.counts.dislikeCount ?? 0) - 1
          : current.counts.dislikeCount,
    },
  }
}

function toggleDislike(current: InteractionOverride): InteractionOverride {
  if (current.state.disliked) {
    return {
      state: { ...current.state, disliked: false },
      counts: {
        ...current.counts,
        dislikeCount: Math.max(0, (current.counts.dislikeCount ?? 0) - 1),
      },
    }
  }

  return {
    state: { ...current.state, disliked: true, liked: false },
    counts: {
      ...current.counts,
      dislikeCount: (current.counts.dislikeCount ?? 0) + 1,
      likeCount:
        current.state.liked && (current.counts.likeCount ?? 0) > 0
          ? (current.counts.likeCount ?? 0) - 1
          : current.counts.likeCount,
    },
  }
}

function toggleFavorite(current: InteractionOverride): InteractionOverride {
  const favorited = !current.state.favorited
  return {
    state: { ...current.state, favorited },
    counts: {
      ...current.counts,
      favoriteCount: Math.max(
        0,
        (current.counts.favoriteCount ?? 0) + (favorited ? 1 : -1),
      ),
    },
  }
}

export function useCommunityLocalInteractions() {
  const [revision, bumpRevision] = useReducer((value: number) => value + 1, 0)
  const [overrides, setOverrides] = useState<Record<string, InteractionOverride>>({})

  const resolve = useCallback(
    (
      id: string,
      baseState: CommunityCardActionState = {},
      baseCounts: CommunityCardActionCounts = {},
    ) => {
      void revision

      if (isUiMockCommunityId(id)) {
        const snapshot = readUiMockInteraction(id, baseState, baseCounts)
        if (!snapshot) {
          return { state: baseState, counts: baseCounts }
        }
        return {
          state: snapshot.state,
          counts: snapshot.counts,
        }
      }

      const override = overrides[id]
      if (!override) {
        return { state: baseState, counts: baseCounts }
      }

      return {
        state: { ...baseState, ...override.state },
        counts: { ...baseCounts, ...override.counts },
      }
    },
    [overrides, revision],
  )

  const update = useCallback(
    (
      id: string,
      baseState: CommunityCardActionState,
      baseCounts: CommunityCardActionCounts,
      updater: (current: InteractionOverride) => InteractionOverride,
    ) => {
      setOverrides((current) => {
        const merged = withDefaults(
          { ...baseState, ...current[id]?.state },
          { ...baseCounts, ...current[id]?.counts },
        )
        return {
          ...current,
          [id]: updater(merged),
        }
      })
      bumpRevision()
    },
    [],
  )

  const like = useCallback(
    (id: string, baseState: CommunityCardActionState, baseCounts: CommunityCardActionCounts) => {
      if (isUiMockCommunityId(id)) {
        toggleUiMockLike(id, baseState, baseCounts)
        bumpRevision()
        return
      }
      update(id, baseState, baseCounts, toggleLike)
    },
    [update],
  )

  const dislike = useCallback(
    (id: string, baseState: CommunityCardActionState, baseCounts: CommunityCardActionCounts) => {
      if (isUiMockCommunityId(id)) {
        toggleUiMockDislike(id, baseState, baseCounts)
        bumpRevision()
        return
      }
      update(id, baseState, baseCounts, toggleDislike)
    },
    [update],
  )

  const favorite = useCallback(
    (id: string, baseState: CommunityCardActionState, baseCounts: CommunityCardActionCounts) => {
      if (isUiMockCommunityId(id)) {
        toggleUiMockFavorite(id, baseState, baseCounts)
        bumpRevision()
        return
      }
      update(id, baseState, baseCounts, toggleFavorite)
    },
    [update],
  )

  return {
    like,
    dislike,
    favorite,
    resolve,
  }
}
