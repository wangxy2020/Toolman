import { useCallback, type Dispatch, type SetStateAction } from 'react'

import type { CommunityResourceItem } from '@toolman/shared'

import {
  dislikeCommunityResource,
  favoriteCommunityResource,
  likeCommunityResource,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { applyResourceInteractionResult } from './community-resource-interaction-utils'
import { COMMUNITY_UI_MOCK_ENABLED, COMMUNITY_UI_MOCK_IDS } from './community-ui-mock'
import {
  applyUiMockInteractionToResource,
  toggleUiMockDislike,
  toggleUiMockFavorite,
  toggleUiMockLike,
} from './community-ui-mock-interactions'

export function useCommunityResourceInteractions(
  setItems: Dispatch<SetStateAction<CommunityResourceItem[]>>,
  setInteractionId: Dispatch<SetStateAction<string | null>>,
  setInteractionAction: Dispatch<SetStateAction<'like' | 'dislike' | 'favorite' | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const syncMockResource = useCallback((resourceId: string) => {
    setItems((current) =>
      current.map((item) => (item.id === resourceId ? applyUiMockInteractionToResource(item) : item)),
    )
  }, [setItems])

  const applyInteractionResult = useCallback((resourceId: string, result: Parameters<typeof applyResourceInteractionResult>[1]) => {
    setItems((current) =>
      current.map((item) =>
        item.id === resourceId ? applyResourceInteractionResult(item, result) : item,
      ),
    )
  }, [setItems])

  const like = useCallback(
    async (resourceId: string) => {
      setInteractionId(resourceId)
      setInteractionAction('like')
      setError(null)
      try {
        if (COMMUNITY_UI_MOCK_ENABLED && resourceId === COMMUNITY_UI_MOCK_IDS.resource) {
          toggleUiMockLike(resourceId)
          syncMockResource(resourceId)
          notifyCommunityUserDataChanged()
          return
        }
        const result = await likeCommunityResource(resourceId)
        applyInteractionResult(resourceId, result)
        notifyCommunityUserDataChanged()
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '点赞失败'
        setError(message)
        throw interactionError
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [applyInteractionResult, setError, setInteractionAction, setInteractionId, syncMockResource],
  )

  const dislike = useCallback(
    async (resourceId: string) => {
      setInteractionId(resourceId)
      setInteractionAction('dislike')
      setError(null)
      try {
        if (COMMUNITY_UI_MOCK_ENABLED && resourceId === COMMUNITY_UI_MOCK_IDS.resource) {
          toggleUiMockDislike(resourceId)
          syncMockResource(resourceId)
          notifyCommunityUserDataChanged()
          return
        }
        const result = await dislikeCommunityResource(resourceId)
        applyInteractionResult(resourceId, {
          ...result,
          liked: result.liked ?? (result.disliked === true ? false : undefined),
        })
        notifyCommunityUserDataChanged()
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '点踩失败'
        setError(message)
        throw interactionError
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [applyInteractionResult, setError, setInteractionAction, setInteractionId, syncMockResource],
  )

  const favorite = useCallback(
    async (resourceId: string) => {
      setInteractionId(resourceId)
      setInteractionAction('favorite')
      setError(null)
      try {
        if (COMMUNITY_UI_MOCK_ENABLED && resourceId === COMMUNITY_UI_MOCK_IDS.resource) {
          toggleUiMockFavorite(resourceId)
          syncMockResource(resourceId)
          notifyCommunityUserDataChanged()
          return
        }
        const result = await favoriteCommunityResource(resourceId)
        applyInteractionResult(resourceId, result)
        notifyCommunityUserDataChanged()
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '收藏失败'
        setError(message)
        throw interactionError
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [applyInteractionResult, setError, setInteractionAction, setInteractionId, syncMockResource],
  )

  return { like, dislike, favorite }
}
