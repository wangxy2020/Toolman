import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Layers,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { useMemo } from 'react'

import { useI18n } from '../../i18n/useI18n'
import {
  formatProjectMoney,
  MOCK_EPC_PROJECTS,
  type EpcProjectRecord,
} from './projectManagementMock'

export type ProjectDashboardVariant = 'cost' | 'progress'

interface Props {
  variant: ProjectDashboardVariant
}

type TrendDirection = 'up' | 'down' | null

interface KpiCardModel {
  key: string
  label: string
  value: string
  sub: string
  trend: TrendDirection
  delta: string
  icon: ReactNode
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template,
  )
}

function StatusBadge({ status }: { status: EpcProjectRecord['status'] }) {
  const { t } = useI18n()
  const className =
    status === 'critical'
      ? 'tm-pm-status tm-pm-status--critical'
      : status === 'warning'
        ? 'tm-pm-status tm-pm-status--warning'
        : 'tm-pm-status tm-pm-status--normal'
  const label =
    status === 'critical'
      ? t('projectManagerPage.dashboard.status.critical')
      : status === 'warning'
        ? t('projectManagerPage.dashboard.status.warning')
        : t('projectManagerPage.dashboard.status.normal')

  return <span className={className}>{label}</span>
}

const ProjectManagementDashboard: FC<Props> = ({ variant }) => {
  const { t } = useI18n()
  const isCost = variant === 'cost'
  const prefix = isCost ? 'projectManagerPage.dashboard.cost' : 'projectManagerPage.dashboard.progress'

  const aggregates = useMemo(() => {
    const contractTotal = MOCK_EPC_PROJECTS.reduce((sum, p) => sum + p.contractValue, 0)
    const settledTotal = MOCK_EPC_PROJECTS.reduce((sum, p) => sum + p.settledAmount, 0)
    const pendingTotal = MOCK_EPC_PROJECTS.reduce((sum, p) => sum + p.pendingAmount, 0)
    const avgProgress =
      MOCK_EPC_PROJECTS.length > 0
        ? MOCK_EPC_PROJECTS.reduce((sum, p) => sum + p.progressPercent, 0) / MOCK_EPC_PROJECTS.length
        : 0
    const varianceRate =
      contractTotal > 0 ? ((contractTotal - settledTotal) / contractTotal) * 100 : 0
    const overdueCount = MOCK_EPC_PROJECTS.filter((p) => p.status !== 'normal').length
    const settlementRate =
      contractTotal > 0 ? ((settledTotal / contractTotal) * 100).toFixed(1) : '0'

    return {
      projectCount: MOCK_EPC_PROJECTS.length,
      contractTotal,
      settledTotal,
      pendingTotal,
      avgProgress,
      varianceRate,
      overdueCount,
      settlementRate,
    }
  }, [])

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
          sub: interpolate(t(`${prefix}.kpi.settled.sub`), { value: aggregates.settlementRate }),
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

  const renderProjectCard = (project: EpcProjectRecord) => {
    const settlementRate =
      project.contractValue > 0 ? (project.settledAmount / project.contractValue) * 100 : 0

    return (
      <article key={project.id} className="tm-pm-project-card">
        <div className="tm-pm-project-card-header">
          <div>
            <div className="tm-pm-project-code">{project.code}</div>
            <div className="tm-pm-project-name" title={project.name}>
              {project.name}
            </div>
          </div>
          <StatusBadge status={project.status} />
        </div>

        <div className="tm-pm-metric-row">
          {isCost ? (
            <>
              <div className="tm-pm-metric-item">
                <span className="tm-pm-metric-label">{t(`${prefix}.card.contract`)}</span>
                <span className="tm-pm-metric-value">{formatProjectMoney(project.contractValue)}</span>
              </div>
              <div className="tm-pm-metric-item">
                <span className="tm-pm-metric-label">{t(`${prefix}.card.settled`)}</span>
                <span className="tm-pm-metric-value">{formatProjectMoney(project.settledAmount)}</span>
              </div>
              <div className="tm-pm-metric-item">
                <span className="tm-pm-metric-label">{t(`${prefix}.card.pending`)}</span>
                <span
                  className={[
                    'tm-pm-metric-value',
                    project.pendingAmount > 10_000_000 ? 'tm-pm-metric-value--warn' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}>
                  {formatProjectMoney(project.pendingAmount)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="tm-pm-metric-item">
                <span className="tm-pm-metric-label">{t(`${prefix}.card.plan`)}</span>
                <span className="tm-pm-metric-value">{project.progressPercent}%</span>
              </div>
              <div className="tm-pm-metric-item">
                <span className="tm-pm-metric-label">{t(`${prefix}.card.actual`)}</span>
                <span className="tm-pm-metric-value">{settlementRate.toFixed(0)}%</span>
              </div>
              <div className="tm-pm-metric-item">
                <span className="tm-pm-metric-label">{t(`${prefix}.card.milestone`)}</span>
                <span
                  className={[
                    'tm-pm-metric-value',
                    project.status !== 'normal' ? 'tm-pm-metric-value--warn' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}>
                  {project.planPhase}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="tm-pm-progress-track">
          <div className="tm-pm-progress-meta">
            <span>
              {isCost
                ? interpolate(t(`${prefix}.card.progress`), { value: project.progressPercent })
                : interpolate(t(`${prefix}.card.planMeta`), { value: project.progressPercent })}
            </span>
            <span>
              {isCost
                ? interpolate(t(`${prefix}.card.settlementRate`), {
                    value: settlementRate.toFixed(0),
                  })
                : interpolate(t(`${prefix}.card.completionRate`), {
                    value: settlementRate.toFixed(0),
                  })}
            </span>
          </div>
          <div className="tm-pm-progress-bar">
            <div
              className="tm-pm-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, project.progressPercent))}%` }}
            />
          </div>
        </div>

        <div className="tm-pm-project-meta">
          <span>{project.region}</span>
          <span>{project.planPhase}</span>
          <span>{project.period}</span>
        </div>
      </article>
    )
  }

  const insightPrimaryValue = isCost
    ? aggregates.contractTotal > 0
      ? `${((aggregates.pendingTotal / aggregates.contractTotal) * 100).toFixed(1)}%`
      : '0%'
    : aggregates.contractTotal > 0
      ? `${(100 - aggregates.varianceRate).toFixed(1)}%`
      : '0%'

  if (MOCK_EPC_PROJECTS.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.dashboard.empty')}</div>
  }

  return (
    <div className="tm-pm-dashboard">
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

      <section className="tm-pm-section">
        <div className="tm-pm-section-head">
          <h3 className="tm-pm-section-title">{t(`${prefix}.sectionTitle`)}</h3>
          <span className="tm-pm-section-desc">{t(`${prefix}.sectionDesc`)}</span>
        </div>
        <div className="tm-pm-project-grid">
          {MOCK_EPC_PROJECTS.slice(0, 6).map((project) => renderProjectCard(project))}
        </div>
      </section>

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
    </div>
  )
}

export default ProjectManagementDashboard
