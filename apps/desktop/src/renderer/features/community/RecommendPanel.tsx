import {
  IconMcp,
  IconNews,
  IconRefresh,
  IconSkill,
  IconWorkflow,
} from '../../components/icons'
import { formatCommunityCount } from './community-market-utils'
import { formatNewsArticleDescription, formatNewsDate } from './community-news-utils'
import { useCommunityRecommendations } from './useCommunityRecommendations'

import type { CommunityNewsArticle, CommunityResourceItem } from '@toolman/shared'
import type { ReactNode } from 'react'

function ResourceRecommendCard({ item }: { item: CommunityResourceItem }) {
  return (
    <article className="tm-community-recommend-card">
      <h4 className="tm-community-recommend-card-title">{item.title}</h4>
      <p className="tm-community-recommend-card-meta">
        {item.author.displayName} · v{item.version} · {formatCommunityCount(item.installCount)} 次安装
      </p>
      {item.description ? (
        <p className="tm-community-recommend-card-desc">{item.description}</p>
      ) : null}
    </article>
  )
}

function NewsRecommendCard({ article }: { article: CommunityNewsArticle }) {
  return (
    <article className="tm-community-recommend-card">
      <h4 className="tm-community-recommend-card-title">{article.title}</h4>
      <p className="tm-community-recommend-card-meta">
        {article.sourceTitle} · {formatNewsDate(article.publishedAt)}
      </p>
      {article.summary ? (
        <p className="tm-community-recommend-card-desc">{formatNewsArticleDescription(article)}</p>
      ) : null}
    </article>
  )
}

function RecommendSection({
  title,
  icon,
  emptyHint,
  children,
}: {
  title: string
  icon: ReactNode
  emptyHint: string
  children?: ReactNode
}) {
  return (
    <section className="tm-community-recommend-section">
      <header className="tm-community-recommend-section-header">
        <span className="tm-community-recommend-section-icon">{icon}</span>
        <h3 className="tm-community-recommend-section-title">{title}</h3>
      </header>
      <div className="tm-community-recommend-section-body">
        {children ?? <p className="tm-community-recommend-empty">{emptyHint}</p>}
      </div>
    </section>
  )
}

export function RecommendPanel() {
  const recommend = useCommunityRecommendations()
  const hubOffline = recommend.hubStatus != null && !recommend.hubStatus.running

  return (
    <div className="tm-community-market tm-community-recommend">
      <header className="tm-community-market-header">
        <div>
          <h2 className="tm-community-market-title">为你推荐</h2>
          <p className="tm-community-market-subtitle">聚合热门 MCP、Skills、工作流与资讯</p>
        </div>
        <button
          type="button"
          className="tm-btn"
          title="刷新"
          aria-label="刷新"
          disabled={recommend.loading}
          onClick={() => void recommend.load()}
        >
          <IconRefresh size={14} />
        </button>
      </header>

      {hubOffline ? (
        <div className="tm-community-market-banner" role="status">
          Community Hub 未运行
          {recommend.hubStatus?.error ? `：${recommend.hubStatus.error}` : '，推荐内容可能不可用。'}
        </div>
      ) : null}

      {recommend.error ? <div className="tm-error-bar">{recommend.error}</div> : null}

      <div className="tm-kb-file-panel tm-community-recommend-content">
        {recommend.loading && !recommend.hasContent ? (
          <div className="tm-session-empty">加载推荐内容中…</div>
        ) : !recommend.hasContent ? (
          <div className="tm-kb-file-panel-empty">
            <p>暂无推荐内容，请确认 Community Hub 已启动并已发布资源或拉取资讯</p>
          </div>
        ) : (
          <div className="tm-community-recommend-grid">
          <RecommendSection
            title="热门 MCP"
            icon={<IconMcp size={18} />}
            emptyHint="暂无 MCP 推荐"
          >
            {recommend.data.mcp.length > 0 ? (
              <div className="tm-community-recommend-cards">
                {recommend.data.mcp.map((item) => (
                  <ResourceRecommendCard key={item.id} item={item} />
                ))}
              </div>
            ) : null}
          </RecommendSection>

          <RecommendSection
            title="热门 Skills"
            icon={<IconSkill size={18} />}
            emptyHint="暂无 Skills 推荐"
          >
            {recommend.data.skill.length > 0 ? (
              <div className="tm-community-recommend-cards">
                {recommend.data.skill.map((item) => (
                  <ResourceRecommendCard key={item.id} item={item} />
                ))}
              </div>
            ) : null}
          </RecommendSection>

          <RecommendSection
            title="热门工作流"
            icon={<IconWorkflow size={18} />}
            emptyHint="暂无工作流推荐"
          >
            {recommend.data.workflow.length > 0 ? (
              <div className="tm-community-recommend-cards">
                {recommend.data.workflow.map((item) => (
                  <ResourceRecommendCard key={item.id} item={item} />
                ))}
              </div>
            ) : null}
          </RecommendSection>

          <RecommendSection
            title="推荐资讯"
            icon={<IconNews size={18} />}
            emptyHint="暂无资讯推荐"
          >
            {recommend.data.news.length > 0 ? (
              <div className="tm-community-recommend-cards">
                {recommend.data.news.map((article) => (
                  <NewsRecommendCard key={article.id} article={article} />
                ))}
              </div>
            ) : null}
          </RecommendSection>
        </div>
        )}
      </div>
    </div>
  )
}
