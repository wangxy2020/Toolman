import { forwardRef, useState, type ReactNode } from 'react'

import {
  type CommunityReportTargetType,
} from '@toolman/shared'

import {
  IconComment,
  IconDownload,
  IconFlag,
  IconShare,
  IconStar,
  IconThumbDown,
  IconThumbUp,
  IconTrash,
} from '../../components/icons'
import { formatCommunityCount } from './community-market-utils'
import { CommunityReportModal } from './CommunityReportModal'
import { useRegistrationGate } from '../user/useRegistrationGate'
import { useI18n } from '../../i18n/useI18n'

export interface CommunityCardActionCounts {
  likeCount?: number
  dislikeCount?: number
  favoriteCount?: number
  installCount?: number
  commentCount?: number
}

export interface CommunityCardActionState {
  liked?: boolean
  disliked?: boolean
  favorited?: boolean
}

export interface CommunityReportTarget {
  targetType: CommunityReportTargetType
  targetId: string
}

interface Props {
  counts?: CommunityCardActionCounts
  state?: CommunityCardActionState
  showInstall?: boolean
  busyAction?: 'like' | 'dislike' | 'favorite' | 'comment' | 'share' | 'install' | 'report' | 'delete' | null
  reportTarget?: CommunityReportTarget
  onLike?: () => void
  onComment?: () => void
  commentsExpanded?: boolean
  onDislike?: () => void
  onFavorite?: () => void
  onShare?: () => void
  onInstall?: () => void
  onDelete?: () => void
}

type ActionKind =
  | 'like'
  | 'comment'
  | 'dislike'
  | 'favorite'
  | 'share'
  | 'install'
  | 'report'
  | 'delete'

function ActionButton({
  kind,
  label,
  count,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  kind: ActionKind
  label: string
  count?: number
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={[
        'tm-community-card-action',
        `tm-community-card-action--${kind}`,
        active ? 'tm-community-card-action--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled || !onClick}
      onClick={onClick}
    >
      {children}
      {count != null ? (
        <span className="tm-community-card-action-count">{formatCommunityCount(count)}</span>
      ) : null}
    </button>
  )
}

export const CommunityListCardActions = forwardRef<HTMLDivElement, Props>(function CommunityListCardActions(
  {
  counts = {},
  state = {},
  showInstall = false,
  busyAction = null,
  reportTarget,
  onLike,
  onComment,
  commentsExpanded = false,
  onDislike,
  onFavorite,
  onShare,
  onInstall,
  onDelete,
  },
  ref,
) {
  const { t } = useI18n()
  const [showReport, setShowReport] = useState(false)
  const { requireRegistration, modal } = useRegistrationGate()
  const actionsBusy =
    busyAction != null && busyAction !== 'report' && busyAction !== 'delete'

  const guardWrite = (callback?: () => void) => {
    if (!callback) return undefined
    return () => {
      if (!requireRegistration('community_write')) return
      callback()
    }
  }

  return (
    <>
      <div className="tm-community-list-card-actions" ref={ref}>
        <div className="tm-community-list-card-actions-start">
          {showInstall ? (
            <ActionButton
              kind="install"
              label={t('communityPage.actions.install')}
              count={counts.installCount}
              disabled={busyAction === 'install'}
              onClick={guardWrite(onInstall)}
            >
              <IconDownload size={14} className="tm-community-card-action-svg" />
            </ActionButton>
          ) : null}
          {onDelete ? (
            <ActionButton
              kind="delete"
              label={t('communityPage.actions.delete')}
              disabled={busyAction === 'delete'}
              onClick={guardWrite(onDelete)}
            >
              <IconTrash size={14} className="tm-community-card-action-svg" />
            </ActionButton>
          ) : null}
        </div>

        <div className="tm-community-list-card-actions-main">
          <ActionButton
            kind="like"
            label={t('communityPage.actions.like')}
            count={counts.likeCount}
            active={state.liked}
            disabled={actionsBusy}
            onClick={guardWrite(onLike)}
          >
            <IconThumbUp size={14} filled={state.liked} className="tm-community-card-action-svg" />
          </ActionButton>
          {onComment ? (
            <ActionButton
              kind="comment"
              label={t('communityPage.actions.comment')}
              count={counts.commentCount}
              active={commentsExpanded}
              disabled={actionsBusy}
              onClick={guardWrite(onComment)}
            >
              <IconComment size={14} className="tm-community-card-action-svg" />
            </ActionButton>
          ) : null}
          <ActionButton
            kind="dislike"
            label={t('communityPage.actions.dislike')}
            count={counts.dislikeCount}
            active={state.disliked}
            disabled={actionsBusy}
            onClick={guardWrite(onDislike)}
          >
            <IconThumbDown
              size={14}
              filled={state.disliked}
              className="tm-community-card-action-svg"
            />
          </ActionButton>
          <ActionButton
            kind="favorite"
            label={t('communityPage.actions.favorite')}
            count={counts.favoriteCount}
            active={state.favorited}
            disabled={actionsBusy}
            onClick={guardWrite(onFavorite)}
          >
            <IconStar
              size={14}
              filled={state.favorited}
              className="tm-community-card-action-svg"
            />
          </ActionButton>
          {onShare ? (
            <ActionButton
              kind="share"
              label={t('communityPage.actions.share')}
              disabled={actionsBusy}
              onClick={onShare}
            >
              <IconShare size={14} className="tm-community-card-action-svg" />
            </ActionButton>
          ) : null}
          {reportTarget ? (
            <ActionButton
              kind="report"
              label={t('communityPage.actions.report')}
              disabled={busyAction === 'report'}
              onClick={() => {
                if (!requireRegistration('community_write')) return
                setShowReport(true)
              }}
            >
              <IconFlag size={14} className="tm-community-card-action-svg" />
            </ActionButton>
          ) : null}
        </div>
      </div>

      {showReport && reportTarget ? (
        <CommunityReportModal
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          onClose={() => setShowReport(false)}
        />
      ) : null}
      {modal}
    </>
  )
})
