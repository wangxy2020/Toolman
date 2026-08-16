import type { FC } from 'react'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import {
  useProjectManagementSettingsPanel,
  type ProjectManagementSettingsPanelProps as Props,
} from './useProjectManagementSettingsPanel'
import { ProjectManagementSettingsCalendarTab } from './ProjectManagementSettingsCalendarTab'
import { ProjectManagementSettingsGanttTab } from './ProjectManagementSettingsGanttTab'
import { ProjectManagementSettingsProjectsTab } from './ProjectManagementSettingsProjectsTab'

const ProjectManagementSettingsPanel: FC<Props> = (props) => {
  const {
    t,
    isPlanSettings,
    customFields,
    settings,
    projects,
    draft,
    setDraft,
    activeTab,
    setActiveTab,
    loading,
    error,
    deletingId,
    pendingDeleteProject,
    setPendingDeleteProject,
    modalTitle,
    tabs,
    handleSave,
    handleCancel,
    statusLabel,
    headerModeLabel,
    handleDeleteProject,
  } = useProjectManagementSettingsPanel(props)

  return (
    <>
    <div className="tm-modal-overlay tm-modal-overlay--kb-settings" onClick={handleCancel}>
      <div
        className="tm-kb-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-settings-title"
        onClick={(event) => event.stopPropagation()}>
        <header className="tm-kb-settings-modal-header">
          <h3 id="pm-settings-title" className="tm-kb-settings-modal-title">
            <span className="tm-kb-settings-modal-title-dot" aria-hidden="true" />
            {modalTitle}
          </h3>
          <button
            type="button"
            className="tm-kb-settings-modal-close"
            aria-label={t('projectManagerPage.database.cancel')}
            onClick={handleCancel}>
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

        {!isPlanSettings ? (
          <>
            <div className="tm-kb-settings-modal-content">
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">
                  {t('projectManagerPage.domainSettings.placeholderComingSoon')}
                </p>
              </div>
            </div>
            <footer className="tm-kb-settings-modal-footer">
              <div className="tm-kb-settings-modal-footer-actions">
                <button
                  type="button"
                  className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
                  onClick={handleCancel}>
                  {t('projectManagerPage.database.cancel')}
                </button>
              </div>
            </footer>
          </>
        ) : loading || !settings ? (
          <div className="tm-kb-settings-modal-content">
            <div className="tm-pm-empty">
              {error ?? t('projectManagerPage.domainSettings.loading')}
            </div>
          </div>
        ) : (
          <>
            <div className="tm-kb-settings-modal-body">
              <nav
                className="tm-kb-settings-modal-nav"
                aria-label={t('projectManagerPage.toolbar.settings')}>
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
                {error ? (
                  <p className="tm-kb-settings-hint tm-pm-project-info-error">{error}</p>
                ) : null}

                {activeTab === 'gantt' ? (
                  <ProjectManagementSettingsGanttTab
                    t={t}
                    draft={draft}
                    setDraft={setDraft}
                    customFields={customFields}
                    headerModeLabel={headerModeLabel}
                  />
                ) : null}

                {activeTab === 'calendar' ? (
                  <ProjectManagementSettingsCalendarTab
                    t={t}
                    draft={draft}
                    setDraft={setDraft}
                  />
                ) : null}

                {activeTab === 'projects' ? (
                  <ProjectManagementSettingsProjectsTab
                    t={t}
                    projects={projects}
                    deletingId={deletingId}
                    statusLabel={statusLabel}
                    setPendingDeleteProject={setPendingDeleteProject}
                  />
                ) : null}
              </div>
            </div>
            <footer className="tm-kb-settings-modal-footer">
              <div className="tm-kb-settings-modal-footer-actions">
                <button
                  type="button"
                  className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
                  onClick={handleCancel}>
                  {t('projectManagerPage.database.cancel')}
                </button>
                <button
                  type="button"
                  className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
                  onClick={handleSave}>
                  {t('projectManagerPage.domainSettings.save')}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>

      {pendingDeleteProject ? (
        <ConfirmDialog
          title={t('projectManagerPage.domainSettings.projectsDeleteTitle')}
          message={t('projectManagerPage.domainSettings.projectsDeleteConfirm', {
            name: pendingDeleteProject.name,
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDeleteProject(null)}
          onConfirm={() => void handleDeleteProject(pendingDeleteProject)}
        />
      ) : null}
    </>
  )
}

export default ProjectManagementSettingsPanel
