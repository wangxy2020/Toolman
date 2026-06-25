import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { type CommunityBoardMessage } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { formatBoardMessageTitle, formatNewsDate } from './community-news-utils'

interface Props {
  message: CommunityBoardMessage
  onClose: () => void
}

export function MessageBoardDetailModal({ message, onClose }: Props) {
  const { t } = useI18n()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const modal = (
    <div className="tm-modal-overlay tm-modal-overlay--news-article" onClick={onClose}>
      <div
        className="tm-community-news-article-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('communityPage.messageDetail.ariaLabel')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-community-news-article-modal-header">
          <div className="tm-community-news-article-modal-head-main">
            <h2 className="tm-community-news-article-modal-title">
              {formatBoardMessageTitle(message.body, 200)}
            </h2>
            <p className="tm-community-news-article-modal-meta">
              <span>{message.author.displayName}</span>
              <span>·</span>
              <span>{formatNewsDate(message.createdAt)}</span>
            </p>
          </div>
          <button type="button" className="tm-modal-close" aria-label={t('common.close')} onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-community-news-article-modal-body">
          <div className="tm-community-message-detail-body">{message.body}</div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
