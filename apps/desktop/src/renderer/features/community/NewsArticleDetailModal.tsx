import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { type CommunityNewsArticle } from '@toolman/shared'

import { getCommunityNewsArticle } from './community-api.client'
import {
  formatNewsDate,
  handleNewsArticleContentClick,
  isPlaceholderNewsAuthor,
  resolveNewsArticleBodyHtml,
} from './community-news-utils'

interface Props {
  articleId: string
  preview?: CommunityNewsArticle | null
  onClose: () => void
}

export function NewsArticleDetailModal({ articleId, preview, onClose }: Props) {
  const [article, setArticle] = useState<CommunityNewsArticle | null>(preview ?? null)
  const [loading, setLoading] = useState(!preview)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void getCommunityNewsArticle(articleId)
      .then((detail) => {
        if (!cancelled) setArticle(detail)
      })
      .catch((loadError) => {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : '加载资讯详情失败'
          setError(message)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [articleId])

  const display = article
  const bodyHtml = display ? resolveNewsArticleBodyHtml(display) : ''

  const modal = (
    <div className="tm-modal-overlay tm-modal-overlay--news-article" onClick={onClose}>
      <div
        className="tm-community-news-article-modal"
        role="dialog"
        aria-modal="true"
        aria-label="资讯详情"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-community-news-article-modal-header">
          <div className="tm-community-news-article-modal-head-main">
            <h2 className="tm-community-news-article-modal-title">
              {display?.title ?? preview?.title ?? '资讯详情'}
            </h2>
            {display ? (
              <p className="tm-community-news-article-modal-meta">
                <span>{display.sourceTitle}</span>
                {display.author && !isPlaceholderNewsAuthor(display.author) ? (
                  <>
                    <span>·</span>
                    <span>{display.author}</span>
                  </>
                ) : null}
                <span>·</span>
                <span>{formatNewsDate(display.publishedAt)}</span>
              </p>
            ) : null}
          </div>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="tm-community-news-article-modal-body">
          {error ? <div className="tm-error-bar">{error}</div> : null}

          {loading && !display ? (
            <div className="tm-session-empty">加载资讯中…</div>
          ) : display ? (
            <>
              {display.coverUrl ? (
                <div className="tm-community-news-article-modal-cover">
                  <img src={display.coverUrl} alt="" loading="lazy" />
                </div>
              ) : null}

              {bodyHtml ? (
                <div
                  className="tm-community-news-content"
                  onClick={handleNewsArticleContentClick}
                  dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
              ) : (
                <div className="tm-community-news-content">
                  <p>{display.title}</p>
                </div>
              )}

              {display.link ? (
                <div className="tm-community-news-article-modal-footer-link">
                  <a
                    href={display.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(event) => {
                      event.preventDefault()
                      window.open(display.link, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    查看原文
                  </a>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
