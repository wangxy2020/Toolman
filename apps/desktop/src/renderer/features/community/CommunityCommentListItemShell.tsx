import { useRef, type ReactNode } from 'react'

import { CommunityCommentDropdown } from './CommunityCommentDropdown'
import {
  CommunityListCardActions,
  type CommunityCardActionCounts,
  type CommunityCardActionState,
  type CommunityReportTarget,
} from './CommunityListCardActions'
import type { CommunityCommentTarget } from './community-comment-utils'
import type { useCommunityCommentExpansion } from './useCommunityCommentExpansion'

type CommentExpansion = ReturnType<typeof useCommunityCommentExpansion>

interface Props {
  commentTarget: CommunityCommentTarget
  comments: CommentExpansion
  fallbackCommentCount?: number
  children: ReactNode
  counts?: Omit<CommunityCardActionCounts, 'commentCount'>
  state?: CommunityCardActionState
  showInstall?: boolean
  busyAction?: 'like' | 'dislike' | 'favorite' | 'comment' | 'share' | 'install' | 'report' | 'delete' | null
  reportTarget?: CommunityReportTarget
  onLike?: () => void
  onDislike?: () => void
  onFavorite?: () => void
  onShare?: () => void
  onInstall?: () => void
  onDelete?: () => void
}

export function CommunityCommentListItemShell({
  commentTarget,
  comments,
  fallbackCommentCount = 0,
  children,
  counts,
  state,
  showInstall,
  busyAction,
  reportTarget,
  onLike,
  onDislike,
  onFavorite,
  onShare,
  onInstall,
  onDelete,
}: Props) {
  const actionsRef = useRef<HTMLDivElement>(null)
  const commentOpen = comments.isExpanded(commentTarget)

  return (
    <li className="tm-community-list-item">
      {children}
      <CommunityListCardActions
        ref={actionsRef}
        counts={{
          ...counts,
          commentCount: comments.getCount(commentTarget, fallbackCommentCount),
        }}
        state={state}
        showInstall={showInstall}
        busyAction={busyAction}
        reportTarget={reportTarget}
        commentsExpanded={commentOpen}
        onLike={onLike}
        onComment={() => comments.toggleExpanded(commentTarget)}
        onDislike={onDislike}
        onFavorite={onFavorite}
        onShare={onShare}
        onInstall={onInstall}
        onDelete={onDelete}
      />
      <CommunityCommentDropdown
        anchorRef={actionsRef}
        target={commentTarget}
        open={commentOpen}
        onClose={() => comments.toggleExpanded(commentTarget)}
        onCountChange={(count) => comments.setCount(commentTarget, count)}
      />
    </li>
  )
}
