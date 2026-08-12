import type { FC } from 'react'

import type { Props } from './pm-project-info-dialog-utils'
import { ProjectInfoDialogAdvancedTab } from './ProjectInfoDialogAdvancedTab'
import { ProjectInfoDialogCostTab } from './ProjectInfoDialogCostTab'
import { ProjectInfoDialogDomainTab } from './ProjectInfoDialogDomainTab'
import { ProjectInfoDialogFooter } from './ProjectInfoDialogFooter'
import { ProjectInfoDialogOverviewTab } from './ProjectInfoDialogOverviewTab'
import { ProjectInfoDialogResourceTab } from './ProjectInfoDialogResourceTab'
import { ProjectInfoDialogScheduleTab } from './ProjectInfoDialogScheduleTab'
import { ProjectInfoDialogStatisticsTab } from './ProjectInfoDialogStatisticsTab'
import { useProjectInfoDialog } from './useProjectInfoDialog'

const ProjectInfoDialog: FC<Props> = (props) => {
  const state = useProjectInfoDialog(props)
  const { onClose, t, activeTab, setActiveTab, tabs, modalTitle, error } = state

  return (
    <div className="tm-modal-overlay tm-modal-overlay--kb-settings" onClick={onClose}>
      <div
        className="tm-kb-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-project-info-title"
        onClick={(event) => event.stopPropagation()}>
        <header className="tm-kb-settings-modal-header">
          <h3 id="pm-project-info-title" className="tm-kb-settings-modal-title">
            <span className="tm-kb-settings-modal-title-dot" aria-hidden="true" />
            {modalTitle}
          </h3>
          <button
            type="button"
            className="tm-kb-settings-modal-close"
            aria-label={t('projectManagerPage.database.cancel')}
            onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-kb-settings-modal-body">
          <nav className="tm-kb-settings-modal-nav" aria-label={modalTitle}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-kb-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-kb-settings-modal-nav-item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="tm-kb-settings-modal-content">
            {error ? <p className="tm-kb-settings-hint tm-pm-project-info-error">{error}</p> : null}

            {activeTab === 'overview' ? <ProjectInfoDialogOverviewTab {...state} /> : null}
            {activeTab === 'domain' ? <ProjectInfoDialogDomainTab {...state} /> : null}
            {activeTab === 'resource' ? <ProjectInfoDialogResourceTab {...state} /> : null}
            {activeTab === 'cost' ? <ProjectInfoDialogCostTab {...state} /> : null}
            {activeTab === 'schedule' ? <ProjectInfoDialogScheduleTab {...state} /> : null}
            {activeTab === 'statistics' ? <ProjectInfoDialogStatisticsTab {...state} /> : null}
            {activeTab === 'advanced' ? <ProjectInfoDialogAdvancedTab {...state} /> : null}
                </div>
                </div>

        <ProjectInfoDialogFooter {...state} props={props} />
                                  </div>
                                </div>
                              )
}

export default ProjectInfoDialog
