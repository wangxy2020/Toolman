import { useEffect, useRef } from 'react'

import { IconTrash, IconX } from '../../components/icons'
import { formatCommunityDate } from './community-market-utils'
import { CommunityCommentInput } from './CommunityCommentInput'
import type { CommunityCommentTarget } from './community-comment-utils'
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
    <section className="tm-community-inline-comments" aria-label="评论区">
      <header className="tm-community-inline-comments-header">
        <h4 className="tm-community-inline-comments-title">评论区</h4>
        {onClose ? (
          <button
            type="button"
            className="tm-community-comment-dropdown-close"
            title="关闭"
            aria-label="关闭评论区"
            onClick={onClose}
          >
            <IconX size={14} />
          </button>
        ) : null}
      </header>

      <div className="tm-community-inline-comments-body">
        {comments.error ? <div className="tm-error-bar">{comments.error}</div> : null}

        {comments.loading ? (
          <div className="tm-community-inline-comments-empty">加载评论中…</div>
        ) : comments.items.length === 0 ? (
          <div className="tm-community-inline-comments-empty">
            {emptyHint ?? '暂无评论，来发表第一条吧'}
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
                        title="删除评论"
                        aria-label="删除评论"
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
        placeholder={user.profile ? '写下你的评论…' : '请先登录后再评论'}
      />
    </section>
  )
}
