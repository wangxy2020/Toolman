import { useMemo, useState } from 'react'

import { type CommunityBoardMessage } from '@toolman/shared'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconMessageBoard } from '../../components/icons'
import { deleteCommunityBoardMessage } from './community-api.client'
import { notifyCommunityBoardChanged } from './community-events'
import { formatBoardMessageTitle, formatNewsDate, formatNewsPreview } from './community-news-utils'
import { buildBoardReplyTarget } from './community-comment-utils'
import { sortCommunityListItems } from './community-list-sort'
import { CommunityCommentListItemShell } from './CommunityCommentListItemShell'
import { CommunityListFileCard } from './CommunityListFileCard'
import { CommunityListPanelShell } from './CommunityListPanelShell'
import { CommunityMessagePublishModal } from './CommunityMessagePublishModal'
import { copyCommunityShareText } from './community-share-utils'
import { isUiMockCommunityId } from './community-ui-mock'
import { useCommunityListSortContext } from './CommunityListSortContext'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useCommunityMessageBoard } from './useCommunityMessageBoard'
import { useCommunityUser } from './useCommunityUser'
import { useRegistrationGate } from '../user/useRegistrationGate'
import { useCommunityPanelStatus } from './community-panel-status'

export function MessageBoardPanel() {
  const [showPublish, setShowPublish] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messageToDelete, setMessageToDelete] = useState<CommunityBoardMessage | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { sortField, sortAscending } = useCommunityListSortContext()
  const comments = useCommunityCommentExpansion()
  const board = useCommunityMessageBoard()
  const user = useCommunityUser()
  const { requireRegistration, modal } = useRegistrationGate()

  useCommunityPanelStatus('community-message-board', {
    loading: board.loading,
    error: board.error,
    onClearError: () => board.setError(null),
  })
  useCommunityPanelStatus('community-message-board-user', {
    error: user.error,
  })

  const sortedItems = useMemo(
    () =>
      sortCommunityListItems(
        board.items.map((message) => ({
          ...message,
          title: formatBoardMessageTitle(message.body),
          createdAt: message.createdAt,
          sizeBytes: message.body.length,
        })),
        sortField,
        sortAscending,
      ),
    [board.items, sortAscending, sortField],
  )

  const handleConfirmDelete = async () => {
    if (!messageToDelete) return

    const messageId = messageToDelete.id
    setDeletingId(messageId)
    try {
      if (!isUiMockCommunityId(messageId)) {
        await deleteCommunityBoardMessage(messageId)
      }
      setMessageToDelete(null)
      if (selectedId === messageId) setSelectedId(null)
      await board.load()
      notifyCommunityBoardChanged()
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '删除留言失败'
      board.setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <CommunityListPanelShell
        title="留言板"
        subtitle="浏览社区留言与互动讨论；点赞/收藏经 Hub HTTP 同步，不经 P2P"
        publishLabel="发布留言"
        loading={board.loading}
        onRefresh={() => void board.load()}
        onPublish={() => {
          if (!requireRegistration('community_write')) return
          setShowPublish(true)
        }}
        isEmpty={sortedItems.length === 0}
        emptyHint="暂无留言，点击右上角发布第一条留言"
      >
        <ul className="tm-kb-file-list">
          {sortedItems.map((message) => {
            const isOwner = user.profile?.id === message.author.id
            const commentTarget = buildBoardReplyTarget(message.id)

            return (
              <CommunityCommentListItemShell
                key={message.id}
                commentTarget={commentTarget}
                comments={comments}
                fallbackCommentCount={message.replyCount}
                counts={{
                  likeCount: message.likeCount,
                  dislikeCount: message.dislikeCount,
                  favoriteCount: message.favoriteCount,
                }}
                state={{
                  liked: message.likedByMe,
                  disliked: message.dislikedByMe,
                  favorited: message.favoritedByMe,
                }}
                reportTarget={{ targetType: 'comment', targetId: message.id }}
                busyAction={
                  deletingId === message.id
                    ? 'delete'
                    : board.interactionId === message.id
                      ? board.interactionAction
                      : null
                }
                onDelete={isOwner ? () => setMessageToDelete(message) : undefined}
                onLike={() => void board.like(message.id)}
                onDislike={() => void board.dislike(message.id)}
                onFavorite={() => void board.favorite(message.id)}
                onShare={() => void copyCommunityShareText(message.body)}
              >
                <CommunityListFileCard
                  title={formatBoardMessageTitle(message.body)}
                  description={formatNewsPreview(message.body)}
                  meta={
                    <>
                      <span>{message.author.displayName}</span>
                      <span>·</span>
                      <span>{formatNewsDate(message.createdAt)}</span>
                    </>
                  }
                  selected={selectedId === message.id}
                  onClick={() =>
                    setSelectedId((current) => (current === message.id ? null : message.id))
                  }
                  icon={<IconMessageBoard size={18} />}
                />
              </CommunityCommentListItemShell>
            )
          })}
        </ul>
      </CommunityListPanelShell>

      {showPublish ? (
        <CommunityMessagePublishModal
          onClose={() => setShowPublish(false)}
          onCreated={() => void board.load()}
        />
      ) : null}

      {messageToDelete ? (
        <ConfirmDialog
          title="删除留言"
          message="确定删除这条留言吗？删除后不可恢复。"
          confirmLabel="删除"
          danger
          onCancel={() => setMessageToDelete(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
      {modal}
    </>
  )
}
