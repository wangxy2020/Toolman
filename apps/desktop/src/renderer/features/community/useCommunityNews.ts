import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  type CommunityNewsArticle,
  type CommunityNewsListInput,
} from '@toolman/shared'

import {
  favoriteCommunityNewsArticle,
  dislikeCommunityNewsArticle,
  fetchCommunityNewsSource,
  getCommunityNewsArticle,
  likeCommunityNewsArticle,
  listCommunityNewsArticles,
  listCommunityNewsSources,
  listRecommendedCommunityNews,
} from './community-api.client'
import { formatNewsListError } from './community-news-utils'
import { formatCommunityHubError, isCommunityHubRateLimitError } from './community-hub-error-utils'
import {
  fetchCommunityListCached,
  readCommunityListCache,
} from './community-list-cache'
import { notifyCommunityUserDataChanged } from './community-events'
import { COMMUNITY_SESSION_CHANGED_EVENT } from '../user/community-session'
import {
  COMMUNITY_UI_MOCK_ENABLED,
  COMMUNITY_UI_MOCK_IDS,
  getUiMockNewsArticle,
  withUiMockItem,
} from './community-ui-mock'
import {
  applyUiMockInteractionToNews,
  toggleUiMockDislike,
  toggleUiMockFavorite,
  toggleUiMockLike,
} from './community-ui-mock-interactions'
import { applyNewsInteractionResult } from './community-news-interaction-utils'

export interface UseCommunityNewsOptions {
  query?: CommunityNewsListInput
  autoLoad?: boolean
  loadRecommended?: boolean
  autoLoadDetail?: boolean
}

export interface LoadCommunityNewsOptions {
  /** 手动刷新时拉取所有已启用的 RSS 源后再更新列表 */
  fetchFeeds?: boolean
}

async function fetchEnabledNewsSources(
  mode: 'all-enabled' | 'needs-initial-fetch',
): Promise<void> {
  const sources = await listCommunityNewsSources()
  const toFetch =
    mode === 'all-enabled'
      ? sources.items.filter((source) => source.enabled)
      : sources.items.filter(
          (source) => source.enabled && (!source.lastFetchedAt || source.lastError),
        )

  if (toFetch.length === 0) return

  for (const source of toFetch) {
    await fetchCommunityNewsSource({ sourceId: source.id }).catch(() => undefined)
  }
}

export function useCommunityNews(options: UseCommunityNewsOptions = {}) {
  const { query, autoLoad = true, loadRecommended = false, autoLoadDetail = false } = options
  const listInput = useMemo(() => ({ ...query }), [query])
  const cacheKey = useMemo(() => `news:${JSON.stringify(listInput)}`, [listInput])

  const [items, setItems] = useState<CommunityNewsArticle[]>([])
  const [recommended, setRecommended] = useState<CommunityNewsArticle[]>([])
  const [detail, setDetail] = useState<CommunityNewsArticle | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [interactionId, setInteractionId] = useState<string | null>(null)
  const [interactionAction, setInteractionAction] = useState<
    'like' | 'dislike' | 'favorite' | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (loadOptions?: LoadCommunityNewsOptions) => {
    const force = Boolean(loadOptions?.fetchFeeds)
    const cached = !force
      ? readCommunityListCache<Awaited<ReturnType<typeof listCommunityNewsArticles>>>(cacheKey)
      : null
    if (!cached?.items.length) {
      setLoading(true)
    }
    setError(null)
    try {
      if (loadOptions?.fetchFeeds) {
        await fetchEnabledNewsSources('all-enabled')
      }

      const list = force
        ? await listCommunityNewsArticles(listInput)
        : await fetchCommunityListCached(
            cacheKey,
            () => listCommunityNewsArticles(listInput),
            { force: loadOptions?.fetchFeeds },
          )

      const recommendedList = loadRecommended
        ? (await listRecommendedCommunityNews()).items
        : ([] as CommunityNewsArticle[])

      setItems(
        withUiMockItem(list.items, getUiMockNewsArticle()).map(applyUiMockInteractionToNews),
      )
      if (loadRecommended) {
        setRecommended(recommendedList)
      }
      if (autoLoadDetail) {
        setSelectedId((current) => {
          if (current && list.items.some((item) => item.id === current)) return current
          return list.items[0]?.id ?? null
        })
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载资讯失败'
      setError(formatNewsListError(formatCommunityHubError(message)))
      if (!isCommunityHubRateLimitError(message)) {
        setItems([])
        if (loadRecommended) setRecommended([])
      }
    } finally {
      setLoading(false)
    }
  }, [autoLoadDetail, cacheKey, listInput, loadRecommended])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const article = await getCommunityNewsArticle(id)
      setDetail(article)
      setSelectedId(id)
      setItems((current) => current.map((item) => (item.id === id ? article : item)))
      setRecommended((current) => current.map((item) => (item.id === id ? article : item)))
      return article
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载资讯详情失败'
      setError(message)
      setDetail(null)
      throw loadError
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const favorite = useCallback(async (articleId: string) => {
    setInteractionId(articleId)
    setInteractionAction('favorite')
    setError(null)
    try {
      if (COMMUNITY_UI_MOCK_ENABLED && articleId === COMMUNITY_UI_MOCK_IDS.news) {
        toggleUiMockFavorite(articleId)
        setItems((current) =>
          current.map((item) =>
            item.id === articleId ? applyUiMockInteractionToNews(item) : item,
          ),
        )
        notifyCommunityUserDataChanged()
        return
      }
      const result = await favoriteCommunityNewsArticle(articleId)
      setItems((current) =>
        current.map((item) => applyNewsInteractionResult(item, articleId, result)),
      )
      notifyCommunityUserDataChanged()
    } catch (interactionError) {
      const message = interactionError instanceof Error ? interactionError.message : '收藏失败'
      setError(message)
      throw interactionError
    } finally {
      setInteractionId(null)
      setInteractionAction(null)
    }
  }, [])

  const like = useCallback(async (articleId: string) => {
    setInteractionId(articleId)
    setInteractionAction('like')
    setError(null)
    try {
      if (COMMUNITY_UI_MOCK_ENABLED && articleId === COMMUNITY_UI_MOCK_IDS.news) {
        toggleUiMockLike(articleId)
        setItems((current) =>
          current.map((item) =>
            item.id === articleId ? applyUiMockInteractionToNews(item) : item,
          ),
        )
        notifyCommunityUserDataChanged()
        return
      }
      const result = await likeCommunityNewsArticle(articleId)
      setItems((current) =>
        current.map((item) => applyNewsInteractionResult(item, articleId, result)),
      )
      notifyCommunityUserDataChanged()
    } catch (interactionError) {
      const message = interactionError instanceof Error ? interactionError.message : '点赞失败'
      setError(message)
      throw interactionError
    } finally {
      setInteractionId(null)
      setInteractionAction(null)
    }
  }, [])

  const dislike = useCallback(async (articleId: string) => {
    setInteractionId(articleId)
    setInteractionAction('dislike')
    setError(null)
    try {
      if (COMMUNITY_UI_MOCK_ENABLED && articleId === COMMUNITY_UI_MOCK_IDS.news) {
        toggleUiMockDislike(articleId)
        setItems((current) =>
          current.map((item) =>
            item.id === articleId ? applyUiMockInteractionToNews(item) : item,
          ),
        )
        notifyCommunityUserDataChanged()
        return
      }
      const result = await dislikeCommunityNewsArticle(articleId)
      setItems((current) =>
        current.map((item) => applyNewsInteractionResult(item, articleId, result)),
      )
      notifyCommunityUserDataChanged()
    } catch (interactionError) {
      const message = interactionError instanceof Error ? interactionError.message : '点踩失败'
      setError(message)
      throw interactionError
    } finally {
      setInteractionId(null)
      setInteractionAction(null)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) return
    void load()
  }, [autoLoad, load])

  useEffect(() => {
    if (!autoLoad) return
    const reload = () => {
      void load()
    }
    window.addEventListener(COMMUNITY_SESSION_CHANGED_EVENT, reload)
    return () => window.removeEventListener(COMMUNITY_SESSION_CHANGED_EVENT, reload)
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
    recommended,
    detail,
    selected,
    selectedId,
    setSelectedId,
    loading,
    detailLoading,
    interactionId,
    interactionAction,
    error,
    setError,
    load,
    loadDetail,
    favorite,
    like,
    dislike,
  }
}
