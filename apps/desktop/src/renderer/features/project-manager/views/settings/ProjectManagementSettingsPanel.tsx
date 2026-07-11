import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'

import {
  getPmDomainCustomFields,
  type PmDomain,
  type PmDomainSettings,
  type PmProject,
  type PmProjectStatus,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { pmApi } from '../../pm-api'
import {
  SIDEBAR_MENU_I18N_KEY,
  type ConfigurableSidebarMenuKey,
} from '../../projectSidebarMenuConfig'
import { resolvePmDatabaseListDomain } from '../../pm-domain-config'
import {
  DEFAULT_GANTT_TASK_COLORS,
  loadGanttUiPrefs,
  saveGanttUiPrefs,
  type GanttBarStyle,
  type GanttDateHeaderMode,
  type GanttTaskColors,
  type GanttUiPrefs,
} from '../schedule/pm-gantt-prefs'
import { clearPmPlanAppliedProject } from '../../ProjectPlanAgentApplyBar'

type SettingsTab = 'gantt' | 'calendar' | 'projects'

interface Props {
  workspaceId: string
  domain: ConfigurableSidebarMenuKey
  onClose: () => void
  onProjectsChange?: () => void
}

const HEADER_MODE_OPTIONS: GanttDateHeaderMode[] = [
  'day',
  'week',
  'month',
  'year',
  'month_day',
  'year_month',
  'year_month_day',
]

const COLOR_FIELDS: Array<{ key: keyof GanttTaskColors; labelKey: string }> = [
  { key: 'task', labelKey: 'projectManagerPage.domainSettings.colorTask' },
  { key: 'critical', labelKey: 'projectManagerPage.domainSettings.colorCritical' },
  { key: 'summary', labelKey: 'projectManagerPage.domainSettings.colorSummary' },
  { key: 'milestone', labelKey: 'projectManagerPage.domainSettings.colorMilestone' },
]

function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template,
  )
}

const ProjectManagementSettingsPanel: FC<Props> = ({
  workspaceId,
  domain,
  onClose,
  onProjectsChange,
}) => {
  const { t } = useI18n()
  const isPlanSettings = domain === 'progress_management'
  const listDomain = resolvePmDatabaseListDomain(domain) ?? (domain as PmDomain)
  const customFields = getPmDomainCustomFields(listDomain)
  const [settings, setSettings] = useState<PmDomainSettings | null>(null)
  const [projects, setProjects] = useState<PmProject[]>([])
  const [draft, setDraft] = useState<GanttUiPrefs>(() => loadGanttUiPrefs())
  const [activeTab, setActiveTab] = useState<SettingsTab>('gantt')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDeleteProject, setPendingDeleteProject] = useState<PmProject | null>(null)

  const modalTitle = isPlanSettings
    ? t('projectManagerPage.domainSettings.modalTitle')
    : interpolate(t('projectManagerPage.domainSettings.modalTitleForDomain'), {
        domain: t(SIDEBAR_MENU_I18N_KEY[domain]),
      })

  const reload = useCallback(async () => {
    if (!isPlanSettings) {
      setSettings(null)
      setProjects([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [settingsResult, projectsResult] = await Promise.all([
        pmApi.getDomainSettings(workspaceId, listDomain),
        pmApi.listProjects(workspaceId, listDomain),
      ])
      setSettings(settingsResult.settings)
      setProjects(projectsResult.projects)
      setDraft(loadGanttUiPrefs())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [isPlanSettings, listDomain, workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleSave = () => {
    if (!isPlanSettings) {
      onClose()
      return
    }
    saveGanttUiPrefs(draft)
    window.dispatchEvent(new Event('tm-pm-gantt-prefs'))
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  const statusLabel = (status: PmProjectStatus): string => {
    switch (status) {
      case 'planning':
        return t('projectManagerPage.projectInfo.statusPlanning')
      case 'active':
        return t('projectManagerPage.projectInfo.statusActive')
      case 'on_hold':
        return t('projectManagerPage.projectInfo.statusOnHold')
      case 'completed':
        return t('projectManagerPage.projectInfo.statusCompleted')
      case 'archived':
        return t('projectManagerPage.projectInfo.statusArchived')
      default:
        return status
    }
  }

  const handleDeleteProject = async (project: PmProject) => {
    setDeletingId(project.id)
    setError(null)
    try {
      await pmApi.deleteProject(project.id)
      clearPmPlanAppliedProject(workspaceId, project.id)
      setProjects((current) => current.filter((item) => item.id !== project.id))
      onProjectsChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingId(null)
      setPendingDeleteProject(null)
    }
  }

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'gantt', label: t('projectManagerPage.domainSettings.tabGantt') },
    { id: 'calendar', label: t('projectManagerPage.domainSettings.tabCalendar') },
    { id: 'projects', label: t('projectManagerPage.domainSettings.tabProjects') },
  ]

  const headerModeLabel = (mode: GanttDateHeaderMode): string => {
    switch (mode) {
      case 'day':
        return t('projectManagerPage.domainSettings.dateHeaderModeDay')
      case 'week':
        return t('projectManagerPage.domainSettings.dateHeaderModeWeek')
      case 'month':
        return t('projectManagerPage.domainSettings.dateHeaderModeMonth')
      case 'year':
        return t('projectManagerPage.domainSettings.dateHeaderModeYear')
      case 'month_day':
        return t('projectManagerPage.domainSettings.dateHeaderModeMonthDay')
      case 'year_month':
        return t('projectManagerPage.domainSettings.dateHeaderModeYearMonth')
      case 'year_month_day':
      default:
        return t('projectManagerPage.domainSettings.dateHeaderModeYearMonthDay')
    }
  }

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
