import type { FC } from 'react'
import { useMemo } from 'react'

import { buildEpcPortfolioAggregates, MOCK_EPC_PROJECTS } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { DashboardInsights } from './dashboard/DashboardInsights'
import { DashboardKpiCards } from './dashboard/DashboardKpiCards'
import type { ProjectDashboardVariant } from './dashboard/dashboard-types'
import { ProjectCard } from './dashboard/ProjectCard'

export type { ProjectDashboardVariant } from './dashboard/dashboard-types'

interface Props {
  variant: ProjectDashboardVariant
}

const ProjectManagementDashboard: FC<Props> = ({ variant }) => {
  const { t } = useI18n()
  const isCost = variant === 'cost'
  const prefix = isCost ? 'projectManagerPage.dashboard.cost' : 'projectManagerPage.dashboard.progress'
  const aggregates = useMemo(() => buildEpcPortfolioAggregates(), [])

  if (MOCK_EPC_PROJECTS.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.dashboard.empty')}</div>
  }

  return (
    <div className="tm-pm-dashboard">
      <DashboardKpiCards variant={variant} aggregates={aggregates} />

      <section className="tm-pm-section">
        <div className="tm-pm-section-head">
          <h3 className="tm-pm-section-title">{t(`${prefix}.sectionTitle`)}</h3>
          <span className="tm-pm-section-desc">{t(`${prefix}.sectionDesc`)}</span>
        </div>
        <div className="tm-pm-project-grid">
          {MOCK_EPC_PROJECTS.slice(0, 6).map((project) => (
            <ProjectCard key={project.id} project={project} variant={variant} prefix={prefix} />
          ))}
        </div>
      </section>

      <DashboardInsights variant={variant} aggregates={aggregates} />
    </div>
  )
}

export default ProjectManagementDashboard
