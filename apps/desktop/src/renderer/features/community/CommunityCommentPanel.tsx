import { useEffect, useRef } from 'react'

import { IconTrash, IconX } from '../../components/icons'
import { formatCommunityDate } from './community-market-utils'
import { CommunityCommentInput } from './CommunityCommentInput'
import { useI18n } from '../../i18n/useI18n'
import { type CommunityCommentTarget } from './community-comment-utils'
import { useCommunityInlineComments } from './useCommunityInlineComments'
import { canDeleteCommunityComment } from './community-user-utils'
import { useCommunityUser } from './useCommunityUser'

interface Props {
  target: CommunityCommentTarget
  open: boolean
  onCountChange?: (count: number) => void
  onClose?: () => void
  emptyHint?: string
}

export function CommunityCommentPanel({ target, open, onCountChange, onClose, emptyHint }: Props) {
  const { t } = useI18n()
  const user = useCommunityUser()
  const comments = useCommunityInlineComments(target, open)
  const onCountChangeRef = useRef(onCountChange)
  onCountChangeRef.current = onCountChange

  useEffect(() => {
    if (!open) return
    onCountChangeRef.current?.(comments.items.length)
  }, [comments.items.length, open])

  const canDeleteComment = (authorId: string) =>
    canDeleteCommunityComment(authorId, user.profile)

  return (
    <section className="tm-community-inline-comments" aria-label={t('communityPage.comment.aria')}>
      <header className="tm-community-inline-comments-header">
        <h4 className="tm-community-inline-comments-title">{t('communityPage.comment.title')}</h4>
        {onClose ? (
          <button
            type="button"
            className="tm-community-comment-dropdown-close"
            title={t('communityPage.comment.close')}
            aria-label={t('communityPage.comment.closeAria')}
            onClick={onClose}
          >
            <IconX size={14} />
          </button>
        ) : null}
      </header>

      <div className="tm-community-inline-comments-body">
        {comments.error ? <div className="tm-error-bar">{comments.error}</div> : null}

        {comments.loading ? (
          <div className="tm-community-inline-comments-empty">{t('communityPage.comment.loading')}</div>
        ) : comments.items.length === 0 ? (
          <div className="tm-community-inline-comments-empty">
            {emptyHint ?? t('communityPage.comment.empty')}
          </div>
        ) : (
          <ul className="tm-community-inline-comments-list">
            {comments.items.map((item) => (
              <li key={item.id} className="tm-community-inline-comment">
                <div className="tm-community-inline-comment-head">
                  <span className="tm-community-inline-comment-author">
                    {item.author.displayName}
                  </span>
                  <div className="tm-community-inline-comment-head-actions">
                    <span className="tm-community-inline-comment-time">
                      {formatCommunityDate(item.createdAt)}
                    </span>
                    {canDeleteComment(item.userId) ? (
                      <button
                        type="button"
                        className="tm-community-inline-comment-delete"
                        title={t('communityPage.comment.delete')}
                        aria-label={t('communityPage.comment.deleteAria')}
                        disabled={comments.deletingId === item.id}
                        onClick={() => void comments.remove(item.id)}
                      >
                        <IconTrash size={12} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="tm-community-inline-comment-body">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CommunityCommentInput
        value={comments.draft}
        onChange={comments.setDraft}
        onSubmit={() => comments.submit()}
        submitting={comments.submitting}
        disabled={!user.profile}
        placeholder={
          user.profile
            ? t('communityPage.comment.placeholderWrite')
            : t('communityPage.comment.placeholderLogin')
        }
      />
    </section>
  )
}
