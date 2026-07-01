import { ClipboardList, TrendingUp } from 'lucide-react'

import type { EpcPortfolioAggregates } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import type { ProjectDashboardVariant } from './dashboard-types'

type Props = {
  variant: ProjectDashboardVariant
  aggregates: EpcPortfolioAggregates
}

export function DashboardInsights({ variant, aggregates }: Props) {
  const { t } = useI18n()
  const isCost = variant === 'cost'
  const prefix = isCost ? 'projectManagerPage.dashboard.cost' : 'projectManagerPage.dashboard.progress'

  const insightPrimaryValue = isCost
    ? aggregates.contractTotal > 0
      ? `${((aggregates.pendingTotal / aggregates.contractTotal) * 100).toFixed(1)}%`
      : '0%'
    : aggregates.contractTotal > 0
      ? `${(100 - aggregates.varianceRate).toFixed(1)}%`
      : '0%'

  return (
    <div className="tm-pm-insight-grid">
      <div className="tm-pm-insight-card">
        <div className="tm-pm-insight-title">
          <ClipboardList size={16} />
          {t(`${prefix}.insight${isCost ? 'Payment' : 'Health'}.title`)}
        </div>
        <div className="tm-pm-insight-value">{insightPrimaryValue}</div>
        <p className="tm-pm-insight-desc">
          {t(`${prefix}.insight${isCost ? 'Payment' : 'Health'}.desc`)}
        </p>
      </div>
      <div className="tm-pm-insight-card">
        <div className="tm-pm-insight-title">
          <TrendingUp size={16} />
          {t(`${prefix}.insightProgress.title`)}
        </div>
        <div className="tm-pm-insight-value">{aggregates.avgProgress.toFixed(0)}%</div>
        <p className="tm-pm-insight-desc">{t(`${prefix}.insightProgress.desc`)}</p>
      </div>
    </div>
  )
}
