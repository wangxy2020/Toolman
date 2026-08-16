import { useCallback, useState } from 'react'
import { Alert, Platform, Share } from 'react-native'
import { copyToClipboard } from '../utils/clipboard'
import {
  applyInteractionToItem,
  resolveCommentTarget,
  resolveReportTarget,
  toggleCommunityInteraction,
  type CommunityInteractionKind,
  type CommunityListItem,
} from './communityHubClient'
import { notifyLoginRequired } from './communityPaneUtils'

function notify(message: string) {
  if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
    globalThis.alert(message)
    return
  }
  Alert.alert('提示', message)
}

export function useCommunityListInteractions(input: {
  listKind: string
  hubBaseUrl: string
  userId: string | null
  guestBlocked: boolean
  patchItem: (id: string, patch: Partial<CommunityListItem>) => void
}) {
  const { listKind, hubBaseUrl, userId, guestBlocked, patchItem } = input
  const [busyId, setBusyId] = useState<string | null>(null)
  const [commentItemId, setCommentItemId] = useState<string | null>(null)
  const [reportItemId, setReportItemId] = useState<string | null>(null)

  const requireLogin = useCallback(() => {
    if (!userId || guestBlocked) {
      notifyLoginRequired()
      return false
    }
    return true
  }, [guestBlocked, userId])

  const runInteraction = useCallback(
    async (item: CommunityListItem, kind: CommunityInteractionKind) => {
      if (!requireLogin()) return
      if (listKind === 'tasks') {
        notify('任务互动暂未开放')
        return
      }
      setBusyId(`${item.id}:${kind}`)
      try {
        const result = await toggleCommunityInteraction(
          hubBaseUrl,
          { listKind, itemId: item.id, kind },
          userId,
        )
        const next = applyInteractionToItem(item, result)
        patchItem(item.id, {
          likeCount: next.likeCount,
          dislikeCount: next.dislikeCount,
          favoriteCount: next.favoriteCount,
          likedByMe: next.likedByMe,
          dislikedByMe: next.dislikedByMe,
          favoritedByMe: next.favoritedByMe,
        })
      } catch (error) {
        notify(error instanceof Error ? error.message : '操作失败')
      } finally {
        setBusyId(null)
      }
    },
    [hubBaseUrl, listKind, patchItem, requireLogin, userId],
  )

  const shareItem = useCallback(async (item: CommunityListItem) => {
    const text =
      item.link?.trim() ||
      item.body?.trim() ||
      item.description?.trim() ||
      item.title
    try {
      if (Platform.OS !== 'web') {
        await Share.share({ message: text })
        return
      }
      const ok = await copyToClipboard(text)
      notify(ok ? '已复制分享内容' : '复制失败，请手动复制')
    } catch (error) {
      notify(error instanceof Error ? error.message : '分享失败')
    }
  }, [])

  const openComments = useCallback(
    (item: CommunityListItem) => {
      if (!resolveCommentTarget(listKind, item.id)) {
        notify('当前栏目暂不支持评论')
        return
      }
      setCommentItemId(item.id)
    },
    [listKind],
  )

  const openReport = useCallback(
    (item: CommunityListItem) => {
      if (!requireLogin()) return
      if (!resolveReportTarget(listKind, item.id)) {
        notify('当前栏目暂不支持举报')
        return
      }
      setReportItemId(item.id)
    },
    [listKind, requireLogin],
  )

  return {
    busyId,
    commentItemId,
    setCommentItemId,
    reportItemId,
    setReportItemId,
    runInteraction,
    shareItem,
    openComments,
    openReport,
    requireLogin,
  }
}
