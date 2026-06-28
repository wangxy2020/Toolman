import { useCallback, useEffect, useState } from 'react'

import { type CommunityBoardMessage } from '@toolman/shared'

import {
  createCommunityBoardMessage,
  dislikeCommunityBoardMessage,
  favoriteCommunityBoardMessage,
  likeCommunityBoardMessage,
  listCommunityBoardMessages,
} from './community-api.client'
import { notifyCommunityBoardChanged, notifyCommunityUserDataChanged } from './community-events'
import { formatCommunityHubError, isCommunityHubRateLimitError } from './community-hub-error-utils'
import {
  COMMUNITY_LIST_POLL_INTERVAL_MS,
  fetchCommunityListCached,
  invalidateCommunityListCache,
  readCommunityListCache,
} from './community-list-cache'
import { COMMUNITY_USER_DATA_CHANGED_EVENT } from './community-events'
import { COMMUNITY_SESSION_CHANGED_EVENT } from '../user/community-session'
import {
  COMMUNITY_UI_MOCK_ENABLED,
  COMMUNITY_UI_MOCK_IDS,
  getUiMockBoardMessage,
  withUiMockItem,
} from './community-ui-mock'
import {
  applyUiMockInteractionToMessage,
  toggleUiMockDislike,
  toggleUiMockFavorite,
  toggleUiMockLike,
} from './community-ui-mock-interactions'
import { useCommunityYjsBoardUpdates } from './useCommunityYjsUpdates'

function applyMockMessage(message: CommunityBoardMessage): CommunityBoardMessage {
  return applyUiMockInteractionToMessage(message)
}

const BOARD_LIST_CACHE_KEY = 'board:messages:root'

export function useCommunityMessageBoard() {
  const [items, setItems] = useState<CommunityBoardMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [repliesByMessageId, setRepliesByMessageId] = useState<
    Record<string, CommunityBoardMessage[]>
  >({})
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyLoadingIds, setReplyLoadingIds] = useState<Set<string>>(() => new Set())
  const [replySubmittingId, setReplySubmittingId] = useState<string | null>(null)
  const [expandedReplyIds, setExpandedReplyIds] = useState<Set<string>>(() => new Set())
  const [interactionId, setInteractionId] = useState<string | null>(null)
  const [interactionAction, setInteractionAction] = useState<'like' | 'dislike' | 'favorite' | null>(
    null,
  )

  useCommunityYjsBoardUpdates(setItems)

  const load = useCallback(async (options?: { force?: boolean; background?: boolean }) => {
    const background = options?.background === true
    const cached = !options?.force
      ? readCommunityListCache<Awaited<ReturnType<typeof listCommunityBoardMessages>>>(
          BOARD_LIST_CACHE_KEY,
        )
      : null
    if (!background && !cached?.items.length) {
      setLoading(true)
    }
    setError(null)
    try {
      const list = options?.force
        ? await listCommunityBoardMessages()
        : await fetchCommunityListCached(BOARD_LIST_CACHE_KEY, () => listCommunityBoardMessages(), {
            force: options?.force,
          })
      setItems(
        withUiMockItem(list.items, getUiMockBoardMessage()).map(applyMockMessage),
      )
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载留言失败'
      if (COMMUNITY_UI_MOCK_ENABLED) {
        setItems(withUiMockItem([], getUiMockBoardMessage()).map(applyMockMessage))
        setError(null)
      } else {
        setError(formatCommunityHubError(message))
        if (!isCommunityHubRateLimitError(message)) {
          setItems([])
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadReplies = useCallback(async (messageId: string) => {
    setReplyLoadingIds((prev) => {
      const next = new Set(prev)
      next.add(messageId)
      return next
    })
    setError(null)
    try {
      const list = await listCommunityBoardMessages({ parentId: messageId })
      setRepliesByMessageId((prev) => ({ ...prev, [messageId]: list.items }))
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载回复失败'
      setError(formatCommunityHubError(message))
    } finally {
      setReplyLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
    }
  }, [])

  const submit = useCallback(async () => {
    const body = draft.trim()
    if (!body) return

    setSubmitting(true)
    setError(null)
    try {
      await createCommunityBoardMessage({ body })
      setDraft('')
      invalidateCommunityListCache('board:')
      await load({ force: true })
      notifyCommunityBoardChanged()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '发布留言失败'
      setError(message)
      throw submitError
    } finally {
      setSubmitting(false)
    }
  }, [draft, load])

  const submitReply = useCallback(
    async (messageId: string) => {
      const body = (replyDrafts[messageId] ?? '').trim()
      if (!body) return

      setReplySubmittingId(messageId)
      setError(null)
      try {
        await createCommunityBoardMessage({ body, parentId: messageId })
        setReplyDrafts((prev) => ({ ...prev, [messageId]: '' }))
        invalidateCommunityListCache('board:')
        await Promise.all([load({ force: true }), loadReplies(messageId)])
        notifyCommunityBoardChanged()
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : '回复失败'
        setError(message)
        throw submitError
      } finally {
        setReplySubmittingId(null)
      }
    },
    [load, loadReplies, replyDrafts],
  )

  const toggleReplies = useCallback(
    (messageId: string) => {
      setExpandedReplyIds((prev) => {
        const next = new Set(prev)
        if (next.has(messageId)) {
          next.delete(messageId)
        } else {
          next.add(messageId)
          void loadReplies(messageId)
        }
        return next
      })
    },
    [loadReplies],
  )

  const setReplyDraft = useCallback((messageId: string, value: string) => {
    setReplyDrafts((prev) => ({ ...prev, [messageId]: value }))
  }, [])

  const replaceMessage = useCallback((updated: CommunityBoardMessage) => {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }, [])

  const removeMessage = useCallback((messageId: string) => {
    setItems((current) => current.filter((item) => item.id !== messageId))
    setRepliesByMessageId((current) => {
      const next = { ...current }
      delete next[messageId]
      return next
    })
  }, [])

  const like = useCallback(
    async (messageId: string) => {
      setInteractionId(messageId)
      setInteractionAction('like')
      setError(null)
      try {
        if (COMMUNITY_UI_MOCK_ENABLED && messageId === COMMUNITY_UI_MOCK_IDS.message) {
          toggleUiMockLike(messageId)
          setItems((current) =>
            current.map((item) => (item.id === messageId ? applyMockMessage(item) : item)),
          )
          notifyCommunityUserDataChanged()
          return
        }
        const updated = await likeCommunityBoardMessage(messageId)
        replaceMessage(updated)
        notifyCommunityUserDataChanged()
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '点赞失败'
        setError(message)
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [replaceMessage],
  )

  const dislike = useCallback(
    async (messageId: string) => {
      setInteractionId(messageId)
      setInteractionAction('dislike')
      setError(null)
      try {
        if (COMMUNITY_UI_MOCK_ENABLED && messageId === COMMUNITY_UI_MOCK_IDS.message) {
          toggleUiMockDislike(messageId)
          setItems((current) =>
            current.map((item) => (item.id === messageId ? applyMockMessage(item) : item)),
          )
          notifyCommunityUserDataChanged()
          return
        }
        const updated = await dislikeCommunityBoardMessage(messageId)
        replaceMessage(updated)
        notifyCommunityUserDataChanged()
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '点踩失败'
        setError(message)
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [replaceMessage],
  )

  const favorite = useCallback(
    async (messageId: string) => {
      setInteractionId(messageId)
      setInteractionAction('favorite')
      setError(null)
      try {
        if (COMMUNITY_UI_MOCK_ENABLED && messageId === COMMUNITY_UI_MOCK_IDS.message) {
          toggleUiMockFavorite(messageId)
          setItems((current) =>
            current.map((item) => (item.id === messageId ? applyMockMessage(item) : item)),
          )
          notifyCommunityUserDataChanged()
          return
        }
        const updated = await favoriteCommunityBoardMessage(messageId)
        replaceMessage(updated)
        notifyCommunityUserDataChanged()
      } catch (interactionError) {
        const message = interactionError instanceof Error ? interactionError.message : '收藏失败'
        setError(message)
      } finally {
        setInteractionId(null)
        setInteractionAction(null)
      }
    },
    [replaceMessage],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
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
    removeMessage,
    submit,
    repliesByMessageId,
    replyDrafts,
    setReplyDraft,
    replyLoadingIds,
    replySubmittingId,
    expandedReplyIds,
    toggleReplies,
    submitReply,
    interactionId,
    interactionAction,
    like,
    dislike,
    favorite,
  }
}
