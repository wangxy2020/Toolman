import { useI18n } from '../../../../i18n/useI18n'
import { interpolateTemplate } from '../../dashboard/dashboard-types'
import { formatWorkItemDate } from '../schedule/pm-gantt-utils'
import type { UrgentItemCardModel } from './pm-urgent-stats'

function badgeTone(item: UrgentItemCardModel): 'normal' | 'warning' | 'critical' {
  if (item.overdue || item.status === 'blocked') return 'critical'
  if (item.priority === 'urgent' || item.priority === 'high') return 'warning'
  return 'normal'
}

export function UrgentWorkItemCard({ item }: { item: UrgentItemCardModel }) {
  const { t } = useI18n()
  const tone = badgeTone(item)
  const statusLabel = item.overdue
    ? t('projectManagerPage.urgent.status.overdue')
    : t(`projectManagerPage.urgent.status.${item.status}`)
  const priorityKey = item.priority

  return (
    <article className="tm-pm-project-card">
      <div className="tm-pm-project-card-header">
        <div className="tm-pm-project-card-title">
          <div className="tm-pm-project-code">{t(`projectManagerPage.urgent.priority.${priorityKey}`)}</div>
          <div className="tm-pm-project-name" title={item.title}>
            {item.title}
          </div>
        </div>
        <span className={`tm-pm-status tm-pm-status--${tone}`}>
          {statusLabel}
        </span>
      </div>

      <div className="tm-pm-metric-row">
        <div className="tm-pm-metric-item">
          <span className="tm-pm-metric-label">{t('projectManagerPage.urgent.card.priority')}</span>
          <span className="tm-pm-metric-value">
            {t(`projectManagerPage.urgent.priority.${priorityKey}`)}
          </span>
        </div>
        <div className="tm-pm-metric-item">
          <span className="tm-pm-metric-label">{t('projectManagerPage.urgent.card.progress')}</span>
          <span className="tm-pm-metric-value">{item.progressPercent}%</span>
        </div>
        <div className="tm-pm-metric-item">
          <span className="tm-pm-metric-label">{t('projectManagerPage.urgent.card.due')}</span>
          <span
            className={['tm-pm-metric-value', item.overdue ? 'tm-pm-metric-value--warn' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {formatWorkItemDate(item.dueMs)}
          </span>
        </div>
      </div>

      <div className="tm-pm-progress-track">
        <div className="tm-pm-progress-meta">
          <span>
            {interpolateTemplate(t('projectManagerPage.urgent.card.progressMeta'), {
              value: item.progressPercent,
            })}
          </span>
          <span>{item.projectName}</span>
        </div>
        <div className="tm-pm-progress-bar">
          <div
            className="tm-pm-progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, item.progressPercent))}%` }}
          />
        </div>
      </div>

      <div className="tm-pm-project-meta">
        <span>{item.projectName}</span>
        <span>{item.assignee}</span>
        <span>{t(`projectManagerPage.urgent.status.${item.status}`)}</span>
      </div>
    </article>
  )
}
