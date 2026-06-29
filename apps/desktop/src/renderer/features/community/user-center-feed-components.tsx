import { useRef, type ReactNode } from 'react'

import { CommunityCommentDropdown } from './CommunityCommentDropdown'
import { type CommunityCommentTarget } from './community-comment-utils'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useI18n } from '../../i18n/useI18n'
import type { FeedStat } from './user-center-panel-utils'

export function FeedStatIcon({ kind }: { kind: FeedStat['kind'] }) {
  if (kind === 'like') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M14 10h4.757a2 2 0 011.708 2.89l-3.514 6A2 2 0 0115.243 20H7a2 2 0 01-2-2v-8a2 2 0 01.586-1.414l6.586-6.586a2 2 0 012.828 0L15 4.5V10z"
        />
      </svg>
    )
  }
  if (kind === 'favorite') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  )
}

export function UserCenterActionLink({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'primary' | 'danger'
}) {
  return (
    <button
      type="button"
      className={[
        'tm-user-center-text-btn',
        tone === 'primary' ? 'tm-user-center-text-btn--primary' : '',
        tone === 'danger' ? 'tm-user-center-text-btn--danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function UserCenterFeedCard({
  tag,
  date,
  title,
  description,
  stats,
  footerStats,
  actions,
}: {
  tag: string
  date: string
  title: string
  description?: string | null
  stats?: FeedStat[]
  footerStats?: ReactNode
  actions?: ReactNode
}) {
  return (
    <article className="tm-user-center-feed-card">
      <div className="tm-user-center-feed-card-top">
        <span className="tm-user-center-feed-tag">
          <span className="tm-user-center-feed-tag-dot" aria-hidden="true" />
          {tag}
        </span>
        <span className="tm-user-center-feed-date">{date}</span>
      </div>
      <h4 className="tm-user-center-feed-title">{title}</h4>
      {description ? <p className="tm-user-center-feed-desc">{description}</p> : null}
      {footerStats || stats?.length || actions ? (
        <div className="tm-user-center-feed-footer">
          {footerStats ? (
            <div className="tm-user-center-feed-stats">{footerStats}</div>
          ) : stats && stats.length > 0 ? (
            <div className="tm-user-center-feed-stats">
              {stats.map((stat) => (
                <span
                  key={`${stat.kind}-${stat.label}`}
                  className={[
                    'tm-user-center-feed-stat',
                    stat.accent ? 'tm-user-center-feed-stat--accent' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <FeedStatIcon kind={stat.kind} />
                  {stat.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="tm-user-center-feed-stats" aria-hidden="true" />
          )}
          {actions ? <div className="tm-user-center-feed-actions">{actions}</div> : null}
        </div>
      ) : null}
    </article>
  )
}

export function UserCenterRejectedFeedbackStat({
  target,
  comments,
  t,
}: {
  target: CommunityCommentTarget
  comments: ReturnType<typeof useCommunityCommentExpansion>
  t: ReturnType<typeof useI18n>['t']
}) {
  const statRef = useRef<HTMLButtonElement>(null)
  const open = comments.isExpanded(target)
  const commentCount = comments.getCount(target)

  return (
    <>
      <button
        ref={statRef}
        type="button"
        className={[
          'tm-user-center-feed-stat',
          'tm-user-center-feed-stat--clickable',
          commentCount > 0 ? 'tm-user-center-feed-stat--accent' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={t('communityPage.mine.viewReviewNotes')}
        aria-expanded={open}
        onClick={() => comments.toggleExpanded(target)}
      >
        <FeedStatIcon kind="reply" />
        {t('communityPage.mine.rejected')}
      </button>
      <CommunityCommentDropdown
        anchorRef={statRef}
        target={target}
        open={open}
        onClose={() => comments.toggleExpanded(target)}
        onCountChange={(count) => comments.setCount(target, count)}
        emptyHint={t('communityPage.mine.noReviewNotes')}
      />
    </>
  )
}

export function UserCenterFeedGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="tm-user-center-feed-group">
      <h3 className="tm-user-center-feed-group-label">{label}</h3>
      <div className="tm-user-center-feed-list">{children}</div>
    </section>
  )
}
