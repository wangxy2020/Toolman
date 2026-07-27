import type { FC } from 'react'

import { formatWorkItemDate } from './pm-gantt-utils'
import { formatMoney } from './pm-project-info-dialog-utils'
import type { ProjectInfoDialogState } from './useProjectInfoDialog'

type Props = Pick<
  ProjectInfoDialogState,
  | 't'
  | 'isFeaturesInfo'
  | 'domainTabKind'
  | 'domainTabLabel'
  | 'featureStats'
  | 'resourceStats'
  | 'costStats'
  | 'stats'
>

export const ProjectInfoDialogStatisticsTab: FC<Props> = ({
  t,
  isFeaturesInfo,
  domainTabKind,
  domainTabLabel,
  featureStats,
  resourceStats,
  costStats,
  stats,
}) => (
  <div className="tm-kb-settings-form">
    <p className="tm-kb-settings-hint">
      {isFeaturesInfo
        ? t('projectManagerPage.projectInfo.featuresStatisticsHint')
        : domainTabKind === 'resource'
          ? t('projectManagerPage.projectInfo.resourceStatisticsHint')
          : domainTabKind === 'cost'
            ? t('projectManagerPage.projectInfo.costStatisticsHint')
            : domainTabKind === 'placeholder'
              ? t('projectManagerPage.projectInfo.domainStatisticsPlaceholderHint', {
                  domain: domainTabLabel,
                })
              : t('projectManagerPage.projectInfo.statisticsHint')}
    </p>
    {isFeaturesInfo ? (
      <div className="tm-pm-project-info-stats">
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statFeatures')}
          </span>
          <strong>{featureStats.total}</strong>
        </div>
      </div>
    ) : domainTabKind === 'placeholder' ? (
      <div className="tm-pm-project-info-domain-placeholder" role="status">
        {t('projectManagerPage.projectInfo.domainPlaceholderEmpty')}
      </div>
    ) : domainTabKind === 'resource' ? (
      <div className="tm-pm-project-info-stats">
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statResources')}
          </span>
          <strong>{resourceStats.total}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statPriced')}
          </span>
          <strong>{resourceStats.priced}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statUnpriced')}
          </span>
          <strong>{resourceStats.unpriced}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statAvgUnitPrice')}
          </span>
          <strong>{resourceStats.avgUnitPrice != null ? formatMoney(resourceStats.avgUnitPrice) : '—'}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statMinUnitPrice')}
          </span>
          <strong>{resourceStats.minPrice != null ? formatMoney(resourceStats.minPrice) : '—'}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statMaxUnitPrice')}
          </span>
          <strong>{resourceStats.maxPrice != null ? formatMoney(resourceStats.maxPrice) : '—'}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statCatalogValue')}
          </span>
          <strong>{resourceStats.priced > 0 ? formatMoney(resourceStats.priceSum) : '—'}</strong>
        </div>
      </div>
    ) : domainTabKind === 'cost' ? (
      <div className="tm-pm-project-info-stats">
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statCosts')}
          </span>
          <strong>{costStats.total}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statPriced')}
          </span>
          <strong>{costStats.priced}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statUnpriced')}
          </span>
          <strong>{costStats.unpriced}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statAvgUnitPrice')}
          </span>
          <strong>{costStats.avgUnitPrice != null ? formatMoney(costStats.avgUnitPrice) : '—'}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statMinUnitPrice')}
          </span>
          <strong>{costStats.minPrice != null ? formatMoney(costStats.minPrice) : '—'}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statMaxUnitPrice')}
          </span>
          <strong>{costStats.maxPrice != null ? formatMoney(costStats.maxPrice) : '—'}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statCatalogTotalPrice')}
          </span>
          <strong>{costStats.totalPriceSum != null ? formatMoney(costStats.totalPriceSum) : '—'}</strong>
        </div>
      </div>
    ) : (
      <div className="tm-pm-project-info-stats">
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statTasks')}
          </span>
          <strong>{stats.total}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statMilestones')}
          </span>
          <strong>{stats.milestones}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statDone')}
          </span>
          <strong>{stats.done}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statInProgress')}
          </span>
          <strong>{stats.inProgress}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statBlocked')}
          </span>
          <strong>{stats.blocked}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statAvgProgress')}
          </span>
          <strong>{stats.avgProgress}%</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statEarliestStart')}
          </span>
          <strong>{stats.earliestStart != null ? formatWorkItemDate(stats.earliestStart) : '—'}</strong>
        </div>
        <div className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">
            {t('projectManagerPage.projectInfo.statLatestFinish')}
          </span>
          <strong>{stats.latestFinish != null ? formatWorkItemDate(stats.latestFinish) : '—'}</strong>
        </div>
      </div>
    )}
  </div>
)
