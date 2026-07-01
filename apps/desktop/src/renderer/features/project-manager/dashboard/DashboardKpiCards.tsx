import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Layers,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useMemo } from 'react'

import { formatProjectMoney, type EpcPortfolioAggregates } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import { interpolateTemplate, type KpiCardModel, type ProjectDashboardVariant } from './dashboard-types'

type Props = {
  variant: ProjectDashboardVariant
  aggregates: EpcPortfolioAggregates
}

export function DashboardKpiCards({ variant, aggregates }: Props) {
  const { t } = useI18n()
  const isCost = variant === 'cost'
  const prefix = isCost ? 'projectManagerPage.dashboard.cost' : 'projectManagerPage.dashboard.progress'

  const kpiCards = useMemo((): KpiCardModel[] => {
    const riskDelta =
      aggregates.overdueCount > 0
        ? t(`${prefix}.kpi.risk.pending`)
        : t(`${prefix}.kpi.risk.none`)
    const varianceDelta =
      aggregates.varianceRate > 35
        ? t(`${prefix}.kpi.variance.high`)
        : t(`${prefix}.kpi.variance.ok`)

    if (isCost) {
      return [
        {
          key: 'projects',
          label: t(`${prefix}.kpi.projects.label`),
          value: `${aggregates.projectCount}`,
          sub: t(`${prefix}.kpi.projects.sub`),
          trend: null,
          delta: '',
          icon: <Building2 size={18} />,
        },
        {
          key: 'contract',
          label: t(`${prefix}.kpi.contract.label`),
          value: formatProjectMoney(aggregates.contractTotal),
          sub: t(`${prefix}.kpi.contract.sub`),
          trend: 'up',
          delta: t(`${prefix}.kpi.contract.delta`),
          icon: <CircleDollarSign size={18} />,
        },
        {
          key: 'settled',
          label: t(`${prefix}.kpi.settled.label`),
          value: formatProjectMoney(aggregates.settledTotal),
          sub: interpolateTemplate(t(`${prefix}.kpi.settled.sub`), { value: aggregates.settlementRate }),
          trend: 'up',
          delta: t(`${prefix}.kpi.settled.delta`),
          icon: <Wallet size={18} />,
        },
        {
          key: 'pending',
          label: t(`${prefix}.kpi.pending.label`),
          value: formatProjectMoney(aggregates.pendingTotal),
          sub: t(`${prefix}.kpi.pending.sub`),
          trend: 'down',
          delta: t(`${prefix}.kpi.pending.delta`),
          icon: <TrendingUp size={18} />,
        },
        {
          key: 'variance',
          label: t(`${prefix}.kpi.variance.label`),
          value: `${aggregates.varianceRate.toFixed(1)}%`,
          sub: t(`${prefix}.kpi.variance.sub`),
          trend: aggregates.varianceRate > 35 ? 'up' : 'down',
          delta: varianceDelta,
          icon: <Layers size={18} />,
        },
        {
          key: 'risk',
          label: t(`${prefix}.kpi.risk.label`),
          value: `${aggregates.overdueCount}`,
          sub: t(`${prefix}.kpi.risk.sub`),
          trend: aggregates.overdueCount > 0 ? 'up' : null,
          delta: riskDelta,
          icon: <AlertTriangle size={18} />,
        },
      ]
    }

    return [
      {
        key: 'projects',
        label: t(`${prefix}.kpi.projects.label`),
        value: `${aggregates.projectCount}`,
        sub: t(`${prefix}.kpi.projects.sub`),
        trend: null,
        delta: '',
        icon: <Building2 size={18} />,
      },
      {
        key: 'plan',
        label: t(`${prefix}.kpi.plan.label`),
        value: `${aggregates.avgProgress.toFixed(0)}%`,
        sub: t(`${prefix}.kpi.plan.sub`),
        trend: 'up',
        delta: t(`${prefix}.kpi.plan.delta`),
        icon: <CircleDollarSign size={18} />,
      },
      {
        key: 'actual',
        label: t(`${prefix}.kpi.actual.label`),
        value: `${aggregates.settlementRate}%`,
        sub: t(`${prefix}.kpi.actual.sub`),
        trend: 'up',
        delta: t(`${prefix}.kpi.actual.delta`),
        icon: <Wallet size={18} />,
      },
      {
        key: 'delay',
        label: t(`${prefix}.kpi.delay.label`),
        value: `${aggregates.overdueCount}`,
        sub: t(`${prefix}.kpi.delay.sub`),
        trend: 'down',
        delta: t(`${prefix}.kpi.delay.delta`),
        icon: <TrendingUp size={18} />,
      },
      {
        key: 'variance',
        label: t(`${prefix}.kpi.variance.label`),
        value: `${aggregates.varianceRate.toFixed(1)}%`,
        sub: t(`${prefix}.kpi.variance.sub`),
        trend: aggregates.varianceRate > 35 ? 'up' : 'down',
        delta: varianceDelta,
        icon: <Layers size={18} />,
      },
      {
        key: 'risk',
        label: t(`${prefix}.kpi.risk.label`),
        value: `${aggregates.overdueCount}`,
        sub: t(`${prefix}.kpi.risk.sub`),
        trend: aggregates.overdueCount > 0 ? 'up' : null,
        delta: riskDelta,
        icon: <AlertTriangle size={18} />,
      },
    ]
  }, [aggregates, isCost, prefix, t])

  return (
    <div className="tm-pm-kpi-grid">
      {kpiCards.map((card) => (
        <div key={card.key} className="tm-pm-kpi-card">
          <div className="tm-pm-kpi-icon">{card.icon}</div>
          <div className="tm-pm-kpi-content">
            <span className="tm-pm-kpi-label">{card.label}</span>
            <span className="tm-pm-kpi-value">{card.value}</span>
            <span className="tm-pm-kpi-sub">
              {card.sub}
              {card.trend ? (
                <span className={`tm-pm-trend tm-pm-trend--${card.trend}`}>
                  {card.trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {card.delta}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
