import { useCallback, useEffect, useMemo, useState } from 'react'

import { type CommunityTaskItem, type CommunityTaskListInput } from '@toolman/shared'

import { getCommunityTask, listCommunityTasks } from './community-api.client'
import { getUiMockTask, withUiMockItem } from './community-ui-mock'

export interface UseCommunityTasksOptions {
  query?: CommunityTaskListInput
  autoLoad?: boolean
}

export function useCommunityTasks(options: UseCommunityTasksOptions = {}) {
  const { query, autoLoad = true } = options
  const listInput = useMemo(() => ({ ...query }), [query])

  const [items, setItems] = useState<CommunityTaskItem[]>([])
  const [detail, setDetail] = useState<CommunityTaskItem | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listCommunityTasks(listInput)
      setItems(withUiMockItem(list.items, getUiMockTask()))
      setSelectedId((current) => {
        if (current && list.items.some((item) => item.id === current)) return current
        return list.items[0]?.id ?? null
      })
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载任务失败'
      setError(message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [listInput])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const task = await getCommunityTask(id)
      setDetail(task)
      setSelectedId(id)
      setItems((current) => current.map((item) => (item.id === id ? task : item)))
      return task
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载任务详情失败'
      setError(message)
      setDetail(null)
      throw loadError
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) return
    void load()
  }, [autoLoad, load])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    void loadDetail(selectedId).catch(() => undefined)
  }, [selectedId, loadDetail])

  const selected = items.find((item) => item.id === selectedId) ?? detail

  return {
    items,
    detail,
    selected,
    selectedId,
    setSelectedId,
    loading,
    detailLoading,
    error,
    setError,
    load,
    loadDetail,
  }
}
