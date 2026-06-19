import { useCallback, useEffect, useState } from 'react'

import { type CommunityTaskApplication } from '@toolman/shared'

import {
  acceptCommunityTaskApplication,
  listCommunityTaskApplications,
} from './community-api.client'

export function useCommunityTaskApplications(taskId: string | null) {
  const [items, setItems] = useState<CommunityTaskApplication[]>([])
  const [loading, setLoading] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!taskId) {
      setItems([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const list = await listCommunityTaskApplications({ taskId })
      setItems(list.items)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载申请失败'
      setError(message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [taskId])

  const accept = useCallback(
    async (applicationId: string) => {
      if (!taskId) return
      setAcceptingId(applicationId)
      setError(null)
      try {
        await acceptCommunityTaskApplication({ taskId, applicationId })
        await load()
      } catch (acceptError) {
        const message = acceptError instanceof Error ? acceptError.message : '接受申请失败'
        setError(message)
        throw acceptError
      } finally {
        setAcceptingId(null)
      }
    },
    [load, taskId],
  )

  useEffect(() => {
    void load()
  }, [load])

  return {
    items,
    loading,
    acceptingId,
    error,
    load,
    accept,
  }
}
