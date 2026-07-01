import { formatProjectMoney, type EpcProjectRecord } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import { interpolateTemplate, type ProjectDashboardVariant } from './dashboard-types'
import { ProjectStatusBadge } from './ProjectStatusBadge'

type Props = {
  project: EpcProjectRecord
  variant: ProjectDashboardVariant
  prefix: string
}

export function ProjectCard({ project, variant, prefix }: Props) {
  const { t } = useI18n()
  const isCost = variant === 'cost'
  const settlementRate =
    project.contractValue > 0 ? (project.settledAmount / project.contractValue) * 100 : 0

  return (
    <article className="tm-pm-project-card">
      <div className="tm-pm-project-card-header">
        <div>
          <div className="tm-pm-project-code">{project.code}</div>
          <div className="tm-pm-project-name" title={project.name}>
            {project.name}
          </div>
        </div>
        <ProjectStatusBadge status={project.status} />
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
              ? interpolateTemplate(t(`${prefix}.card.progress`), { value: project.progressPercent })
              : interpolateTemplate(t(`${prefix}.card.planMeta`), { value: project.progressPercent })}
          </span>
          <span>
            {isCost
              ? interpolateTemplate(t(`${prefix}.card.settlementRate`), {
                  value: settlementRate.toFixed(0),
                })
              : interpolateTemplate(t(`${prefix}.card.completionRate`), {
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
