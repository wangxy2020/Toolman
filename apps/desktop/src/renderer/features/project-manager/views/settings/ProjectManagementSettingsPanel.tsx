import type { FC } from 'react'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import {
  DEFAULT_GANTT_TASK_COLORS,
  type GanttBarStyle,
  type GanttDateHeaderMode,
} from '../schedule/pm-gantt-prefs'
import {
  COLOR_FIELDS,
  HEADER_MODE_OPTIONS,
  useProjectManagementSettingsPanel,
  type ProjectManagementSettingsPanelProps as Props,
} from './useProjectManagementSettingsPanel'

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
                  <div className="tm-kb-settings-form">
                    <p className="tm-kb-settings-hint">
                      {t('projectManagerPage.domainSettings.ganttHint')}
                    </p>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="pm-date-header-mode">
                        {t('projectManagerPage.domainSettings.dateHeaderRows')}
                      </label>
                      <select
                        id="pm-date-header-mode"
                        className="tm-kb-settings-input"
                        value={draft.dateHeaderMode}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            dateHeaderMode: event.target.value as GanttDateHeaderMode,
                          })
                        }>
                        {HEADER_MODE_OPTIONS.map((mode) => (
                          <option key={mode} value={mode}>
                            {headerModeLabel(mode)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="pm-gantt-bar-style">
                        {t('projectManagerPage.domainSettings.barStyle')}
                      </label>
                      <select
                        id="pm-gantt-bar-style"
                        className="tm-kb-settings-input"
                        value={draft.barStyle}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            barStyle: event.target.value as GanttBarStyle,
                          })
                        }>
                        <option value="fill">
                          {t('projectManagerPage.domainSettings.barStyleFill')}
                        </option>
                        <option value="outline">
                          {t('projectManagerPage.domainSettings.barStyleOutline')}
                        </option>
                        <option value="hatch">
                          {t('projectManagerPage.domainSettings.barStyleHatch')}
                        </option>
                      </select>
                    </div>
                    <div className="tm-kb-settings-field-block">
                      <div className="tm-kb-settings-section-head">
                        <span className="tm-kb-settings-section-title">
                          {t('projectManagerPage.domainSettings.taskColorsTitle')}
                        </span>
                        <button
                          type="button"
                          className="tm-kb-settings-link-btn"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              taskColors: { ...DEFAULT_GANTT_TASK_COLORS },
                            })
                          }>
                          {t('projectManagerPage.domainSettings.resetColors')}
                        </button>
                      </div>
                      <div className="tm-pm-gantt-color-grid">
                        {COLOR_FIELDS.map((field) => (
                          <label key={field.key} className="tm-pm-gantt-color-row">
                            <span>{t(field.labelKey)}</span>
                            <input
                              type="color"
                              value={draft.taskColors[field.key]}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  taskColors: {
                                    ...draft.taskColors,
                                    [field.key]: event.target.value,
                                  },
                                })
                              }
                            />
                            <input
                              className="tm-kb-settings-input tm-pm-gantt-color-hex"
                              value={draft.taskColors[field.key]}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  taskColors: {
                                    ...draft.taskColors,
                                    [field.key]: event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                    {customFields.length > 0 ? (
                      <div className="tm-kb-settings-field-block">
                        <div className="tm-kb-settings-section-head">
                          <span className="tm-kb-settings-section-title">
                            {t('projectManagerPage.domainSettings.customFieldsTitle')}
                          </span>
                        </div>
                        <ul className="tm-pm-settings-fields">
                          {customFields.map((field) => (
                            <li key={field.key}>
                              {field.label} · {field.type}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === 'calendar' ? (
                  <div className="tm-kb-settings-form">
                    <p className="tm-kb-settings-hint">
                      {t('projectManagerPage.domainSettings.calendarHint')}
                    </p>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="pm-week-start">
                        {t('projectManagerPage.domainSettings.weekStartsOn')}
                      </label>
                      <select
                        id="pm-week-start"
                        className="tm-kb-settings-input"
                        value={draft.calendarWeekStartsOn}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            calendarWeekStartsOn: Number(event.target.value) === 0 ? 0 : 1,
                          })
                        }>
                        <option value={1}>
                          {t('projectManagerPage.domainSettings.weekStartsMonday')}
                        </option>
                        <option value={0}>
                          {t('projectManagerPage.domainSettings.weekStartsSunday')}
                        </option>
                      </select>
                    </div>
                  </div>
                ) : null}

                {activeTab === 'projects' ? (
                  <div className="tm-kb-settings-form">
                    <p className="tm-kb-settings-hint">
                      {t('projectManagerPage.domainSettings.projectsHint')}
                    </p>
                    {projects.length === 0 ? (
                      <p className="tm-kb-settings-hint">
                        {t('projectManagerPage.domainSettings.projectsEmpty')}
                      </p>
                    ) : (
                      <table className="tm-pm-database-table tm-pm-settings-projects-table">
                        <thead>
                          <tr>
                            <th>{t('projectManagerPage.domainSettings.projectsColCode')}</th>
                            <th>{t('projectManagerPage.domainSettings.projectsColName')}</th>
                            <th>{t('projectManagerPage.domainSettings.projectsColStatus')}</th>
                            <th>{t('projectManagerPage.domainSettings.projectsColActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projects.map((project) => (
                            <tr key={project.id}>
                              <td>{project.code}</td>
                              <td>{project.name}</td>
                              <td>{statusLabel(project.status)}</td>
                              <td>
                                <div className="tm-pm-database-actions">
                                  <button
                                    type="button"
                                    className="tm-pm-settings-project-delete"
                                    disabled={deletingId === project.id}
                                    onClick={() => setPendingDeleteProject(project)}>
                                    {deletingId === project.id
                                      ? t('projectManagerPage.domainSettings.projectsDeleting')
                                      : t('projectManagerPage.domainSettings.projectsDelete')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
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
