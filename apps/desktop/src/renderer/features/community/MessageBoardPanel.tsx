import { useMemo, useState } from 'react'

import { type CommunityBoardMessage } from '@toolman/shared'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconMessageBoard } from '../../components/icons'
import { deleteCommunityBoardMessage } from './community-api.client'
import { notifyCommunityBoardChanged } from './community-events'
import { formatCommunityHubError } from './community-hub-error-utils'
import { invalidateCommunityListCache } from './community-list-cache'
import { formatBoardMessageTitle, formatNewsDate, formatNewsPreview } from './community-news-utils'
import { buildBoardReplyTarget } from './community-comment-utils'
import { sortCommunityListItems } from './community-list-sort'
import { CommunityCommentListItemShell } from './CommunityCommentListItemShell'
import { CommunityListFileCard } from './CommunityListFileCard'
import { CommunityListPanelShell } from './CommunityListPanelShell'
import { CommunityMessagePublishModal } from './CommunityMessagePublishModal'
import { MessageBoardDetailModal } from './MessageBoardDetailModal'
import { copyCommunityShareText } from './community-share-utils'
import { canDeleteCommunityResource } from './community-user-utils'
import { isUiMockCommunityId } from './community-ui-mock'
import { useCommunityListSortContext } from './CommunityListSortContext'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useCommunityMessageBoard } from './useCommunityMessageBoard'
import { useCommunityUser } from './useCommunityUser'
import { useRegistrationGate } from '../user/useRegistrationGate'
import { useCommunityPanelStatus } from './community-panel-status'
import { useI18n } from '../../i18n/useI18n'

export function MessageBoardPanel() {
  const { t } = useI18n()
  const [showPublish, setShowPublish] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailMessageId, setDetailMessageId] = useState<string | null>(null)
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
      if (detailMessageId === messageId) setDetailMessageId(null)
      board.removeMessage(messageId)
      invalidateCommunityListCache('board:')
      notifyCommunityBoardChanged()
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? formatCommunityHubError(deleteError.message)
          : t('communityPage.market.deleteMessageFailed')
      board.setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  const detailMessage = useMemo(
    () => (detailMessageId ? sortedItems.find((item) => item.id === detailMessageId) ?? null : null),
    [detailMessageId, sortedItems],
  )

  return (
    <>
      <CommunityListPanelShell
        title={t('communityPage.panels.messages.title')}
        subtitle={t('communityPage.panels.messages.subtitle')}
        publishLabel={t('communityPage.panels.messages.publish')}
        loading={board.loading}
        onRefresh={() => {
          invalidateCommunityListCache('board:')
          void board.load({ force: true })
        }}
        onPublish={() => {
          if (!requireRegistration('community_write')) return
          setShowPublish(true)
        }}
        isEmpty={sortedItems.length === 0}
        emptyHint={t('communityPage.panels.messages.empty')}
      >
        <ul className="tm-kb-file-list">
          {sortedItems.map((message) => {
            const canDelete = canDeleteCommunityResource(message.author.id, user.profile)
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
                onDelete={canDelete ? () => setMessageToDelete(message) : undefined}
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
                  onClick={() => {
                    setSelectedId(message.id)
                    setDetailMessageId(message.id)
                  }}
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
          onCreated={() => {
            invalidateCommunityListCache('board:')
            void board.load({ force: true })
          }}
        />
      ) : null}

      {messageToDelete ? (
        <ConfirmDialog
          title={t('communityPage.mine.confirm.deleteMessageTitle')}
          message={t('communityPage.mine.confirm.deleteMessageMessage')}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setMessageToDelete(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}

      {detailMessage ? (
        <MessageBoardDetailModal
          message={detailMessage}
          onClose={() => {
            setDetailMessageId(null)
            setSelectedId(null)
          }}
        />
      ) : null}
      {modal}
    </>
  )
}
