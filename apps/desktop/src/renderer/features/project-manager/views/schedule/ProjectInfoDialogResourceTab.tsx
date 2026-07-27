import type { FC } from 'react'

import { PM_RESOURCE_TYPES } from '../resource/pm-resource-catalog'
import type { ProjectInfoDialogState } from './useProjectInfoDialog'

type Props = Pick<
  ProjectInfoDialogState,
  't' | 'isWorkspaceResource' | 'project' | 'resourceStats' | 'resourceTypeLabel'
>

export const ProjectInfoDialogResourceTab: FC<Props> = ({
  t,
  isWorkspaceResource,
  project,
  resourceStats,
  resourceTypeLabel,
}) => (
  <div className="tm-kb-settings-form">
    <p className="tm-kb-settings-hint">
      {isWorkspaceResource
        ? t('projectManagerPage.projectInfo.resourceHintAllProjects')
        : t('projectManagerPage.projectInfo.resourceHint')}
    </p>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label">
        {t('projectManagerPage.projectInfo.fieldResourceScope')}
      </label>
      <span className="tm-kb-settings-readonly">
        {isWorkspaceResource
          ? t('projectManagerPage.headerProject.allProjects')
          : project
            ? [project.code.trim(), project.name.trim()].filter(Boolean).join(' · ') || project.id
            : '—'}
      </span>
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.statResources')}</label>
      <span className="tm-kb-settings-readonly">{resourceStats.total}</span>
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.statPriced')}</label>
      <span className="tm-kb-settings-readonly">{resourceStats.priced}</span>
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.statUnpriced')}</label>
      <span className="tm-kb-settings-readonly">{resourceStats.unpriced}</span>
    </div>
    <div className="tm-pm-project-info-stats">
      {PM_RESOURCE_TYPES.map((type) => (
        <div key={type} className="tm-pm-project-info-stat">
          <span className="tm-pm-project-info-stat-label">{resourceTypeLabel(type)}</span>
          <strong>{resourceStats.byType[type]}</strong>
        </div>
      ))}
    </div>
  </div>
)
