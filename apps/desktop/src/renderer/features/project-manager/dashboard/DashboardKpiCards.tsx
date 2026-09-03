import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  Layers,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useMemo } from 'react'

import { formatProjectMoney, type EpcPortfolioAggregates, type PlanProgressKpiCounts } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import { interpolateTemplate, type KpiCardModel, type ProjectDashboardVariant } from './dashboard-types'
import { PmKpiGrid } from './PmKpiGrid'

type Props = {
  variant: ProjectDashboardVariant
  aggregates: EpcPortfolioAggregates
  planCounts?: PlanProgressKpiCounts
}

export function DashboardKpiCards({ variant, aggregates, planCounts }: Props) {
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

    const monthExpense = Math.max(0, aggregates.contractTotal - aggregates.settledTotal - aggregates.pendingTotal)

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
          trend: 'up',
          delta: '',
          icon: <TrendingUp size={18} />,
        },
        {
          key: 'variance',
          label: t(`${prefix}.kpi.variance.label`),
          value: formatProjectMoney(monthExpense),
          sub: t(`${prefix}.kpi.variance.sub`),
          trend: null,
          delta: '',
          icon: <Layers size={18} />,
        },
        {
          key: 'risk',
          label: t(`${prefix}.kpi.risk.label`),
          value: `${aggregates.avgProgress.toFixed(0)}%`,
          sub: t(`${prefix}.kpi.risk.sub`),
          trend: null,
          delta: '',
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
      planCounts
        ? {
            key: 'monthMilestones',
            label: t(`${prefix}.kpi.monthMilestones.label`),
            value: `${planCounts.monthMilestoneCount}`,
            sub: t(`${prefix}.kpi.monthMilestones.sub`),
            trend: null,
            delta: '',
            icon: <TrendingUp size={18} />,
          }
        : {
            key: 'delay',
            label: t(`${prefix}.kpi.delay.label`),
            value: `${aggregates.overdueCount}`,
            sub: t(`${prefix}.kpi.delay.sub`),
            trend: 'down',
            delta: t(`${prefix}.kpi.delay.delta`),
            icon: <TrendingUp size={18} />,
          },
      planCounts
        ? {
            key: 'monthWorkItems',
            label: t(`${prefix}.kpi.monthWorkItems.label`),
            value: `${planCounts.monthWorkItemCount}`,
            sub: t(`${prefix}.kpi.monthWorkItems.sub`),
            trend: null,
            delta: '',
            icon: <Layers size={18} />,
          }
        : {
            key: 'variance',
            label: t(`${prefix}.kpi.variance.label`),
            value: `${aggregates.varianceRate.toFixed(1)}%`,
            sub: t(`${prefix}.kpi.variance.sub`),
            trend: aggregates.varianceRate > 35 ? 'up' : 'down',
            delta: varianceDelta,
            icon: <Layers size={18} />,
          },
      planCounts
        ? {
            key: 'riskWork',
            label: t(`${prefix}.kpi.riskWork.label`),
            value: `${planCounts.riskWorkItemCount}`,
            sub: t(`${prefix}.kpi.riskWork.sub`),
            trend: planCounts.riskWorkItemCount > 0 ? 'up' : null,
            delta:
              planCounts.riskWorkItemCount > 0
                ? t(`${prefix}.kpi.riskWork.pending`)
                : t(`${prefix}.kpi.riskWork.none`),
            icon: <AlertTriangle size={18} />,
          }
        : {
            key: 'risk',
            label: t(`${prefix}.kpi.risk.label`),
            value: `${aggregates.overdueCount}`,
            sub: t(`${prefix}.kpi.risk.sub`),
            trend: aggregates.overdueCount > 0 ? 'up' : null,
            delta: riskDelta,
            icon: <AlertTriangle size={18} />,
          },
    ]
  }, [aggregates, isCost, planCounts, prefix, t])

  return <PmKpiGrid cards={kpiCards} />
}
