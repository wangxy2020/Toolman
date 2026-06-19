import { useCallback, useEffect, useRef, useState } from 'react'

import type { CommunityComment, CommunityCommentTargetType } from '@toolman/shared'

import {
  countCommunityComments,
  createCommunityComment,
  deleteCommunityComment,
  listCommunityComments,
} from './community-api.client'
import type { CommunityCommentTarget } from './community-comment-utils'
import { commentTargetKey } from './community-comment-utils'
import {
  addUiMockComment,
  deleteUiMockComment,
  isUiMockCommentTarget,
  listUiMockComments,
} from './community-ui-mock-comments'
import { useCommunityUser } from './useCommunityUser'

export function useCommunityInlineComments(
  target: CommunityCommentTarget | null,
  open: boolean,
) {
  const user = useCommunityUser()
  const [items, setItems] = useState<CommunityComment[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const targetKey = target ? commentTargetKey(target) : null
  const targetType = target?.targetType
  const targetId = target?.targetId
  const parentId = target?.parentId ?? undefined

  const targetRef = useRef(target)
  targetRef.current = target

  const load = useCallback(async () => {
    const current = targetRef.current
    if (!current || !open) {
      setItems([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (isUiMockCommentTarget(current)) {
        setItems(listUiMockComments(current))
        return
      }

      const list = await listCommunityComments({
        targetType: current.targetType,
        targetId: current.targetId,
        parentId: current.parentId ?? undefined,
        limit: 100,
      })
      setItems(list.items)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载评论失败'
      setError(message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [open, targetKey, targetType, targetId, parentId])

  useEffect(() => {
    if (!open) {
      setDraft('')
      return
    }
    void load()
  }, [load, open])

  const submit = useCallback(async () => {
    const current = targetRef.current
    if (!current) return
    const body = draft.trim()
    if (!body) return

    const profile = user.profile
    if (!profile) {
      setError('请先登录后再评论')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      if (isUiMockCommentTarget(current)) {
        addUiMockComment(current, body, profile)
        setDraft('')
        setItems(listUiMockComments(current))
        return
      }

      await createCommunityComment({
        targetType: current.targetType as CommunityCommentTargetType,
        targetId: current.targetId,
        parentId: current.parentId ?? undefined,
        body,
      })
      setDraft('')
      await load()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '发表评论失败'
      setError(message)
      throw submitError
    } finally {
      setSubmitting(false)
    }
  }, [draft, load, user.profile])

  const remove = useCallback(
    async (commentId: string) => {
      const current = targetRef.current
      if (!current) return

      setDeletingId(commentId)
      setError(null)
      try {
        if (isUiMockCommentTarget(current)) {
          deleteUiMockComment(current, commentId)
          setItems(listUiMockComments(current))
          return
        }

        await deleteCommunityComment(commentId)
        await load()
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : '删除评论失败'
        setError(message)
        throw deleteError
      } finally {
        setDeletingId(null)
      }
    },
    [load],
  )

  return {
    items,
    loading,
    submitting,
    deletingId,
    draft,
    setDraft,
    error,
    setError,
    load,
    submit,
    remove,
  }
}

export async function fetchCommunityCommentCount(target: CommunityCommentTarget): Promise<number> {
  if (isUiMockCommentTarget(target)) {
    return listUiMockComments(target).length
  }

  const result = await countCommunityComments({
    targetType: target.targetType,
    targetId: target.targetId,
    parentId: target.parentId ?? undefined,
  })
  return result.count
}
