import { useCallback, useEffect, useState } from 'react'

import { type CommunityNewsSource } from '@toolman/shared'

import {
  createCommunityNewsSource,
  deleteCommunityNewsSource,
  fetchCommunityNewsSource,
  listCommunityNewsSources,
} from './community-api.client'
import { formatRssSourceError } from './community-news-utils'

export function useCommunityNewsSources(enabled = true) {
  const [items, setItems] = useState<CommunityNewsSource[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listCommunityNewsSources()
      setItems(list.items)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载 RSS 源失败'
      setError(formatRssSourceError(message))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSource = useCallback(
    async (sourceId: string) => {
      setFetchingId(sourceId)
      setError(null)
      setSuccess(null)
      try {
        const result = (await fetchCommunityNewsSource({ sourceId })) as {
          articlesAdded?: number
          articlesSeen?: number
        }
        const added = result.articlesAdded ?? 0
        const seen = result.articlesSeen ?? 0
        setSuccess(`拉取完成：新增 ${added} 篇，共处理 ${seen} 篇`)
        await load()
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : '拉取 RSS 失败'
        setError(formatRssSourceError(message))
        throw fetchError
      } finally {
        setFetchingId(null)
      }
    },
    [load],
  )

  const createSource = useCallback(
    async (input: {
      title: string
      feedUrl: string
      siteUrl?: string
      category?: string
      language?: string
      fetchIntervalMinutes?: number
    }) => {
      setCreating(true)
      setError(null)
      setSuccess(null)
      try {
        const source = await createCommunityNewsSource(input)
        setSuccess(`已添加 RSS 源「${source.title}」`)
        await load()
        return source
      } catch (createError) {
        const message = createError instanceof Error ? createError.message : '添加 RSS 源失败'
        setError(formatRssSourceError(message))
        throw createError
      } finally {
        setCreating(false)
      }
    },
    [load],
  )

  const deleteSource = useCallback(
    async (sourceId: string) => {
      setDeletingId(sourceId)
      setError(null)
      setSuccess(null)
      try {
        await deleteCommunityNewsSource(sourceId)
        setSuccess('RSS 源已删除')
        await load()
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : '删除 RSS 源失败'
        setError(formatRssSourceError(message))
        throw deleteError
      } finally {
        setDeletingId(null)
      }
    },
    [load],
  )

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  return {
    items,
    loading,
    fetchingId,
    creating,
    deletingId,
    error,
    success,
    setError,
    setSuccess,
    load,
    fetchSource,
    createSource,
    deleteSource,
  }
}
