import { useCallback, useEffect, useState } from 'react'

import {
  type CommunityHubStatusOutput,
  type CommunityNewsArticle,
  type CommunityResourceItem,
} from '@toolman/shared'

import {
  getCommunityHubStatus,
  listCommunityNewsArticles,
  listCommunityResources,
  listRecommendedCommunityNews,
} from './community-api.client'
import {
  getUiMockNewsArticle,
  getUiMockResource,
  withUiMockItem,
} from './community-ui-mock'
import {
  applyUiMockInteractionToNews,
  applyUiMockInteractionToResource,
} from './community-ui-mock-interactions'

export const RECOMMEND_RESOURCE_LIMIT = 5

export interface CommunityRecommendations {
  mcp: CommunityResourceItem[]
  skill: CommunityResourceItem[]
  workflow: CommunityResourceItem[]
  news: CommunityNewsArticle[]
}

const EMPTY_RECOMMENDATIONS: CommunityRecommendations = {
  mcp: [],
  skill: [],
  workflow: [],
  news: [],
}

async function loadPopularResources(resourceType: 'mcp' | 'skill' | 'workflow') {
  const list = await listCommunityResources({
    resourceType,
    sort: 'installs',
    limit: RECOMMEND_RESOURCE_LIMIT,
  })
  return list.items
}

async function loadRecommendedNews() {
  try {
    const recommended = await listRecommendedCommunityNews()
    if (recommended.items.length > 0) {
      return recommended.items.slice(0, RECOMMEND_RESOURCE_LIMIT)
    }
  } catch {
    // fall through to newest articles
  }

  const fallback = await listCommunityNewsArticles({
    sort: 'newest',
    limit: RECOMMEND_RESOURCE_LIMIT,
  })
  return fallback.items
}

export function useCommunityRecommendations(autoLoad = true) {
  const [data, setData] = useState<CommunityRecommendations>(EMPTY_RECOMMENDATIONS)
  const [hubStatus, setHubStatus] = useState<CommunityHubStatusOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [status, mcp, skill, workflow, news] = await Promise.all([
        getCommunityHubStatus(),
        loadPopularResources('mcp'),
        loadPopularResources('skill'),
        loadPopularResources('workflow'),
        loadRecommendedNews(),
      ])
      setHubStatus(status)
      setData({
        mcp: withUiMockItem(mcp, getUiMockResource('mcp')).map(applyUiMockInteractionToResource),
        skill: withUiMockItem(skill, getUiMockResource('skill')).map(applyUiMockInteractionToResource),
        workflow: withUiMockItem(workflow, getUiMockResource('workflow')).map(
          applyUiMockInteractionToResource,
        ),
        news: withUiMockItem(news, getUiMockNewsArticle()).map(applyUiMockInteractionToNews),
      })
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载推荐内容失败'
      setError(message)
      setData(EMPTY_RECOMMENDATIONS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) return
    void load()
  }, [autoLoad, load])

  const hasContent =
    data.mcp.length > 0 ||
    data.skill.length > 0 ||
    data.workflow.length > 0 ||
    data.news.length > 0

  return {
    data,
    hubStatus,
    loading,
    error,
    hasContent,
    load,
  }
}
