import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  CommunityInstallInput,
  CommunityResourceDetail,
  CommunityResourceItem,
  CommunityResourceListInput,
  CommunityResourceType,
} from '@toolman/shared'

import { COMMUNITY_LIST_POLL_INTERVAL_MS } from './community-list-cache'
import { COMMUNITY_USER_DATA_CHANGED_EVENT } from './community-events'
import { useCommunityFederatedCatalogUpdates } from './useCommunityFederatedCatalogUpdates'
import { COMMUNITY_SESSION_CHANGED_EVENT } from '../user/community-session'
import { useCommunityResourceInteractions } from './useCommunityResourceInteractions'
import { useCommunityResourceLoader } from './useCommunityResourceLoader'

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
  const cacheKey = useMemo(
    () => `resources:${JSON.stringify(listInput)}`,
    [listInput],
  )

  const [items, setItems] = useState<CommunityResourceItem[]>([])
  const [detail, setDetail] = useState<CommunityResourceDetail | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [interactionId, setInteractionId] = useState<string | null>(null)
  const [interactionAction, setInteractionAction] = useState<
    'like' | 'dislike' | 'favorite' | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const { load, loadDetail, install: installResource } = useCommunityResourceLoader(
    listInput,
    cacheKey,
    resourceType,
    autoLoadDetail,
    setItems,
    setDetail,
    setSelectedId,
    setLoading,
    setDetailLoading,
    setInstallingId,
    setError,
  )

  const install = useCallback(
    async (input: CommunityInstallInput) => installResource(input, selectedId),
    [installResource, selectedId],
  )

  const { like, dislike, favorite } = useCommunityResourceInteractions(
    setItems,
    setInteractionId,
    setInteractionAction,
    setError,
  )

  useEffect(() => {
    if (!autoLoad) return
    void load()
  }, [autoLoad, load])

  useCommunityFederatedCatalogUpdates(
    resourceType,
    (item) => {
      setItems((current) => {
        const next = current.filter((entry) => entry.id !== item.id)
        next.unshift(item)
        return next
      })
    },
    (resourceId) => {
      setItems((current) => current.filter((entry) => entry.id !== resourceId))
    },
  )

  useEffect(() => {
    if (!autoLoad) return
    const reloadInBackground = () => {
      void load({ force: true, background: true })
    }
    const reloadOnSessionChange = () => {
      void load()
    }
    window.addEventListener(COMMUNITY_SESSION_CHANGED_EVENT, reloadOnSessionChange)
    window.addEventListener(COMMUNITY_USER_DATA_CHANGED_EVENT, reloadInBackground)
    const timer = window.setInterval(reloadInBackground, COMMUNITY_LIST_POLL_INTERVAL_MS)
    return () => {
      window.removeEventListener(COMMUNITY_SESSION_CHANGED_EVENT, reloadOnSessionChange)
      window.removeEventListener(COMMUNITY_USER_DATA_CHANGED_EVENT, reloadInBackground)
      window.clearInterval(timer)
    }
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
    loading,
    detailLoading,
    installingId,
    interactionId,
    interactionAction,
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
