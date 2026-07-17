import type { FC } from 'react'

import type { PmDomain } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { DashboardInsights } from './dashboard/DashboardInsights'
import { DashboardKpiCards } from './dashboard/DashboardKpiCards'
import type { ProjectDashboardVariant } from './dashboard/dashboard-types'
import { ProjectCard } from './dashboard/ProjectCard'
import { usePmDashboardData } from './dashboard/usePmDashboardData'

export type { ProjectDashboardVariant } from './dashboard/dashboard-types'

interface Props {
  workspaceId?: string
  variant: ProjectDashboardVariant
  domain?: PmDomain
  dedupeByCode?: boolean
  mockFallback?: boolean
  /** Bump after project metadata changes so cards refresh without remount. */
  refreshKey?: number
}

const ProjectManagementDashboard: FC<Props> = ({
  workspaceId,
  variant,
  domain,
  dedupeByCode = false,
  mockFallback = true,
  refreshKey = 0,
}) => {
  const { t } = useI18n()
  const isCost = variant === 'cost'
  const prefix = isCost ? 'projectManagerPage.dashboard.cost' : 'projectManagerPage.dashboard.progress'
  const { data, loading, error } = usePmDashboardData(workspaceId, {
    domain,
    dedupeByCode,
    mockFallback,
    refreshKey,
  })

  if (loading && !data) {
    return <div className="tm-pm-empty">{t('projectManagerPage.dashboard.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  if (!data || data.records.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.dashboard.empty')}</div>
  }

  return (
    <div className="tm-pm-dashboard">
      <DashboardKpiCards variant={variant} aggregates={data.aggregates} />

      <section className="tm-pm-section">
        <div className="tm-pm-section-head">
          <h3 className="tm-pm-section-title">{t(`${prefix}.sectionTitle`)}</h3>
          <span className="tm-pm-section-desc">{t(`${prefix}.sectionDesc`)}</span>
        </div>
        <div className="tm-pm-project-grid">
          {data.records.slice(0, 6).map((project) => (
            <ProjectCard key={project.id} project={project} variant={variant} prefix={prefix} />
          ))}
        </div>
      </section>

      <DashboardInsights variant={variant} aggregates={data.aggregates} />
    </div>
  )
}

export default ProjectManagementDashboard
