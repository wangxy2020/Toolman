import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  type CommunityHubStatusOutput,
  type CommunityInstallInput,
  type CommunityResourceDetail,
  type CommunityResourceItem,
  type CommunityResourceListInput,
  type CommunityResourceType,
} from '@toolman/shared'

import {
  dislikeCommunityResource,
  favoriteCommunityResource,
  getCommunityHubStatus,
  getCommunityResource,
  installCommunityResource,
  likeCommunityResource,
  listCommunityResources,
} from './community-api.client'
import {
  COMMUNITY_UI_MOCK_ENABLED,
  COMMUNITY_UI_MOCK_IDS,
  getUiMockResource,
  withUiMockItem,
} from './community-ui-mock'
import {
  applyUiMockInteractionToResource,
  getUiMockResourceItemState,
  toggleUiMockDislike,
  toggleUiMockFavorite,
  toggleUiMockLike,
} from './community-ui-mock-interactions'
import type { CommunityCardActionState } from './CommunityListCardActions'

export interface UseCommunityResourcesOptions {
  resourceType?: CommunityResourceType
  query?: Omit<CommunityResourceListInput, 'resourceType'>
  autoLoad?: boolean
  autoLoadDetail?: boolean
}

export function useCommunityResources(options: UseCommunityResourcesOptions = {}) {
  const { resourceType, query, autoLoad = true, autoLoadDetail = false } = options
  const listInput = useMemo(
    () => ({
      ...query,
      ...(resourceType ? { resourceType } : {}),
    }),
    [query, resourceType],
  )

  const [items, setItems] = useState<CommunityResourceItem[]>([])
  const [detail, setDetail] = useState<CommunityResourceDetail | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hubStatus, setHubStatus] = useState<CommunityHubStatusOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [interactionId, setInteractionId] = useState<string | null>(null)
  const [interactionAction, setInteractionAction] = useState<
    'like' | 'dislike' | 'favorite' | null
  >(null)
  const [itemStates, setItemStates] = useState<Record<string, CommunityCardActionState>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [status, list] = await Promise.all([
        getCommunityHubStatus(),
        listCommunityResources(listInput),
      ])
      setHubStatus(status)
      const mockType = resourceType ?? 'mcp'
      setItems(
        withUiMockItem(list.items, getUiMockResource(mockType)).map(applyUiMockInteractionToResource),
      )
      if (autoLoadDetail) {
        setSelectedId((current) => {
          if (current && list.items.some((item) => item.id === current)) return current
          return list.items[0]?.id ?? null
        })
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载社区资源失败'
      const mockType = resourceType ?? 'mcp'
      if (COMMUNITY_UI_MOCK_ENABLED) {
        setItems(
          withUiMockItem([], getUiMockResource(mockType)).map(applyUiMockInteractionToResource),
        )
        setError(null)
      } else {
        setError(message)
        setItems([])
      }
    } finally {
      setLoading(false)
    }
  }, [autoLoadDetail, listInput])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const resource = await getCommunityResource(id)
      setDetail(resource)
      setSelectedId(id)
      return resource
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载资源详情失败'
      setError(message)
      setDetail(null)
      throw loadError
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const install = useCallback(
    async (input: CommunityInstallInput) => {
      setInstallingId(input.resourceId)
      setError(null)
      try {
        const result = await installCommunityResource(input)
        await load()
        if (selectedId === input.resourceId) {
          await loadDetail(input.resourceId)
        }
        return result
      } catch (installError) {
        const message = installError instanceof Error ? installError.message : '安装失败'
        setError(message)
        throw installError
      } finally {
        setInstallingId(null)
      }
    },
    [load, loadDetail, selectedId],
  )

  const updateItemCounts = useCallback(
    (
      resourceId: string,
      counts: {
        likeCount: number
        dislikeCount: number
        favoriteCount: number
      },
    ) => {
      setItems((current) =>
        current.map((item) =>
          item.id === resourceId
            ? {
                ...item,
                likeCount: counts.likeCount,
                dislikeCount: counts.dislikeCount,
                favoriteCount: counts.favoriteCount,
              }
            : item,
        ),
      )
    },
    [],
  )

  const updateItemState = useCallback(
    (resourceId: string, patch: CommunityCardActionState) => {
      setItemStates((current) => ({
        ...current,
        [resourceId]: {
          ...current[resourceId],
          ...patch,
        },
      }))
    },
    [],
  )

  const syncMockResource = useCallback((resourceId: string) => {
    setItems((items) =>
      items.map((item) => (item.id === resourceId ? applyUiMockInteractionToResource(item) : item)),
    )
  }, [])

  const like = useCallback(
    async (resourceId: string) => {
      setInteractionId(resourceId)
      setInteractionAction('like')
      setError(null)
      try {
        if (COMMUNITY_UI_MOCK_ENABLED && resourceId === COMMUNITY_UI_MOCK_IDS.resource) {
          toggleUiMockLike(resourceId)
          syncMockResource(resourceId)
          return
        }
        const current = itemStates[resourceId]
        const wasLiked = current?.liked ?? false
        const result = await likeCommunityResource(resourceId)
        updateItemCounts(resourceId, result)
        updateItemState(resourceId, {
          liked: !wasLiked,
          disliked: wasLiked ? current?.disliked : false,
        })
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '点赞失败'
        setError(message)
        throw interactionError
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [itemStates, syncMockResource, updateItemCounts, updateItemState],
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
          return
        }
        const current = itemStates[resourceId]
        const wasDisliked = current?.disliked ?? false
        const result = await dislikeCommunityResource(resourceId)
        updateItemCounts(resourceId, result)
        updateItemState(resourceId, {
          liked: wasDisliked ? current?.liked : false,
          disliked: !wasDisliked,
        })
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '点踩失败'
        setError(message)
        throw interactionError
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [itemStates, syncMockResource, updateItemCounts, updateItemState],
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
          return
        }
        const result = await favoriteCommunityResource(resourceId)
        updateItemCounts(resourceId, result)
        const current = itemStates[resourceId]
        updateItemState(resourceId, { favorited: !current?.favorited })
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '收藏失败'
        setError(message)
        throw interactionError
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [itemStates, syncMockResource, updateItemCounts, updateItemState],
  )

  useEffect(() => {
    if (!autoLoad) return
    void load()
  }, [autoLoad, load])

  useEffect(() => {
    if (!autoLoadDetail) return
    if (!selectedId) {
      setDetail(null)
      return
    }
    void loadDetail(selectedId).catch(() => undefined)
  }, [autoLoadDetail, selectedId, loadDetail])

  const selected =
    detail?.id === selectedId ? detail : items.find((item) => item.id === selectedId) ?? null

  return {
    items,
    detail,
    selected,
    selectedId,
    setSelectedId,
    hubStatus,
    loading,
    detailLoading,
    installingId,
    interactionId,
    interactionAction,
    getItemState: (resourceId: string) => {
      if (resourceId === COMMUNITY_UI_MOCK_IDS.resource) {
        return getUiMockResourceItemState(resourceId)
      }
      return itemStates[resourceId] ?? {}
    },
    error,
    setError,
    load,
    loadDetail,
    install,
    like,
    dislike,
    favorite,
  }
}
