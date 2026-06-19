import { useCallback, useEffect, useState } from 'react'

import { type CommunityNewsComment } from '@toolman/shared'

import {
  createCommunityNewsComment,
  listCommunityNewsComments,
} from './community-api.client'

export function useCommunityNewsComments(articleId: string | null) {
  const [items, setItems] = useState<CommunityNewsComment[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!articleId) {
      setItems([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const list = await listCommunityNewsComments({ articleId })
      setItems(list.items)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载评论失败'
      setError(message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [articleId])

  const submit = useCallback(async () => {
    if (!articleId) return
    const body = draft.trim()
    if (!body) return

    setSubmitting(true)
    setError(null)
    try {
      await createCommunityNewsComment({ articleId, body })
      setDraft('')
      await load()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '发表评论失败'
      setError(message)
      throw submitError
    } finally {
      setSubmitting(false)
    }
  }, [articleId, draft, load])

  useEffect(() => {
    setDraft('')
    void load()
  }, [load])

  return {
    items,
    loading,
    submitting,
    draft,
    setDraft,
    error,
    setError,
    load,
    submit,
  }
}
