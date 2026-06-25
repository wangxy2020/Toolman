import {
  CommunityPanelHeader,
  CommunityPanelRefreshButton,
} from './CommunityPanelHeader'
import {
  IconMcp,
  IconNews,
  IconSkill,
  IconWorkflow,
} from '../../components/icons'
import { formatCommunityCount } from './community-market-utils'
import { formatNewsArticleDescription, formatNewsDate } from './community-news-utils'
import { useCommunityRecommendations } from './useCommunityRecommendations'
import { useCommunityPanelStatus } from './community-panel-status'
import { CommunityFederationSourceBadge } from './CommunityFederationSourceBadge'
import { useI18n } from '../../i18n/useI18n'

import type { CommunityNewsArticle, CommunityResourceItem } from '@toolman/shared'
import type { ReactNode } from 'react'

function ResourceRecommendCard({ item }: { item: CommunityResourceItem }) {
  const { t } = useI18n()

  return (
    <article className="tm-community-recommend-card">
      <div className="tm-community-recommend-card-title-row">
        <h4 className="tm-community-recommend-card-title">{item.title}</h4>
        <CommunityFederationSourceBadge source={item.federationSource} />
      </div>
      <p className="tm-community-recommend-card-meta">
        {item.author.displayName} · v{item.version} ·{' '}
        {t('communityPage.recommendSections.installCount', {
          count: formatCommunityCount(item.installCount),
        })}
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
  const { t } = useI18n()
  const recommend = useCommunityRecommendations()

  useCommunityPanelStatus('community-recommend', {
    loading: recommend.loading,
    error: recommend.error,
    loadingMessage: t('communityPage.panels.recommend.loading'),
  })

  return (
    <div className="tm-community-market tm-community-recommend">
      <CommunityPanelHeader
        title={t('communityPage.panels.recommend.title')}
        subtitle={t('communityPage.panels.recommend.subtitle')}
        actions={
          <CommunityPanelRefreshButton
            loading={recommend.loading}
            disabled={recommend.loading}
            onClick={() => void recommend.load()}
          />
        }
      />

      <div className="tm-kb-file-panel tm-community-recommend-content">
        {recommend.loading && !recommend.hasContent ? (
          <div className="tm-session-empty">{t('communityPage.panels.recommend.loading')}</div>
        ) : !recommend.hasContent ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('communityPage.panels.recommend.empty')}</p>
          </div>
        ) : (
          <div className="tm-community-recommend-grid">
          <RecommendSection
            title={t('communityPage.recommendSections.hotMcp')}
            icon={<IconMcp size={18} />}
            emptyHint={t('communityPage.market.recommendMcp')}
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
            title={t('communityPage.recommendSections.hotSkills')}
            icon={<IconSkill size={18} />}
            emptyHint={t('communityPage.market.recommendSkills')}
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
            title={t('communityPage.recommendSections.hotWorkflow')}
            icon={<IconWorkflow size={18} />}
            emptyHint={t('communityPage.market.recommendWorkflow')}
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
            title={t('communityPage.recommendSections.hotNews')}
            icon={<IconNews size={18} />}
            emptyHint={t('communityPage.market.recommendNews')}
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
