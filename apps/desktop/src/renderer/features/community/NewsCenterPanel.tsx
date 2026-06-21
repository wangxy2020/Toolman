import { useEffect, useMemo, useState } from 'react'

import { IconSliders } from '../../components/icons'
import { CommunityPanelSecondaryButton } from './CommunityPanelHeader'
import { buildNewsCommentTarget } from './community-comment-utils'
import { CommunityNewsListIcon } from './community-news-list-icon'
import { sortCommunityListItems } from './community-list-sort'
import {
  formatNewsArticleDescription,
  formatNewsDate,
  getNewsArticleSizeBytes,
} from './community-news-utils'
import { useCommunityListSortContext } from './CommunityListSortContext'
import { CommunityCommentListItemShell } from './CommunityCommentListItemShell'
import { CommunityListFileCard } from './CommunityListFileCard'
import { CommunityListPanelShell } from './CommunityListPanelShell'
import { NewsArticleDetailModal } from './NewsArticleDetailModal'
import { NewsSourcesModal } from './NewsSourcesModal'
import { copyCommunityShareText } from './community-share-utils'
import { COMMUNITY_NEWS_SOURCES_CHANGED_EVENT } from './community-events'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useCommunityNews } from './useCommunityNews'

const NEWS_LIST_QUERY = { sort: 'diverse' as const, limit: 30 }

export function NewsCenterPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailArticleId, setDetailArticleId] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const comments = useCommunityCommentExpansion()
  const { sortField, sortAscending } = useCommunityListSortContext()
  const news = useCommunityNews({
    query: NEWS_LIST_QUERY,
    autoLoadDetail: false,
  })

  useEffect(() => {
    const onSourcesChanged = () => {
      void news.load()
    }
    window.addEventListener(COMMUNITY_NEWS_SOURCES_CHANGED_EVENT, onSourcesChanged)
    return () => window.removeEventListener(COMMUNITY_NEWS_SOURCES_CHANGED_EVENT, onSourcesChanged)
  }, [news.load])

  const listItems = useMemo(
    () =>
      sortCommunityListItems(
        news.items.map((article) => ({
          ...article,
          title: article.title,
          createdAt: article.publishedAt,
          sizeBytes: getNewsArticleSizeBytes(article),
        })),
        sortField,
        sortAscending,
      ),
    [news.items, sortAscending, sortField],
  )

  return (
    <>
      <CommunityListPanelShell
        title="资讯"
        subtitle="查看社区动态、更新公告与 RSS 拉取文章"
        publishLabel="发布资讯"
        showPublish={false}
        loading={news.loading}
        onRefresh={() => void news.load({ fetchFeeds: true })}
        headerExtra={
          <CommunityPanelSecondaryButton
            title="RSS 源管理"
            ariaLabel="RSS 源管理"
            onClick={() => setShowSources(true)}
          >
            <IconSliders size={16} />
            <span>RSS 源</span>
          </CommunityPanelSecondaryButton>
        }
        error={news.error ? <div className="tm-error-bar">{news.error}</div> : null}
        isEmpty={listItems.length === 0}
        emptyHint="暂无资讯文章"
      >
        <ul className="tm-kb-file-list">
          {listItems.map((article) => {
            const commentTarget = buildNewsCommentTarget(article.id)

            return (
              <CommunityCommentListItemShell
                key={article.id}
                commentTarget={commentTarget}
                comments={comments}
                fallbackCommentCount={article.commentCount ?? 0}
                counts={{
                  likeCount: article.likeCount,
                  dislikeCount: article.dislikeCount,
                  favoriteCount: article.favoriteCount,
                }}
                state={{
                  liked: article.likedByMe,
                  disliked: article.dislikedByMe,
                  favorited: article.favoritedByMe,
                }}
                busyAction={
                  news.interactionId === article.id ? news.interactionAction : null
                }
                reportTarget={{ targetType: 'news', targetId: article.id }}
                onLike={() => void news.like(article.id)}
                onDislike={() => void news.dislike(article.id)}
                onFavorite={() => void news.favorite(article.id)}
                onShare={() => void copyCommunityShareText(article.link || article.title)}
              >
                <CommunityListFileCard
                  title={article.title}
                  meta={
                    <>
                      <span>{article.sourceTitle}</span>
                      <span>·</span>
                      <span>{formatNewsDate(article.publishedAt)}</span>
                    </>
                  }
                  description={formatNewsArticleDescription(article) || undefined}
                  selected={selectedId === article.id}
                  coverUrl={article.coverUrl}
                  onClick={() => {
                    setSelectedId(article.id)
                    setDetailArticleId(article.id)
                  }}
                  icon={<CommunityNewsListIcon articleId={article.id} />}
                />
              </CommunityCommentListItemShell>
            )
          })}
        </ul>
      </CommunityListPanelShell>

      {showSources ? (
        <NewsSourcesModal
          onClose={() => setShowSources(false)}
          onFetched={() => void news.load()}
        />
      ) : null}

      {detailArticleId ? (
        <NewsArticleDetailModal
          articleId={detailArticleId}
          preview={news.items.find((item) => item.id === detailArticleId) ?? null}
          onClose={() => {
            setDetailArticleId(null)
            setSelectedId(null)
          }}
        />
      ) : null}
    </>
  )
}
