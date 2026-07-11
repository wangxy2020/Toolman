import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'

import {
  readLastSavedAt,
  readSaveHistory,
  readScheduleVersion,
  type PmDomain,
  type PmProject,
  type PmProjectStatus,
  type PmWorkItem,
} from '@toolman/shared'

import { getDateLocale } from '../../../../i18n/date-locale'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import { formatWorkItemDate } from './pm-gantt-utils'

type InfoTab = 'overview' | 'schedule' | 'statistics' | 'advanced'

type ProjectInfoDraft = {
  code: string
  name: string
  status: PmProjectStatus
  description: string
  workspaceRoot: string
  planStart: string
  planFinish: string
  statusDate: string
  scheduleFrom: 'project_start' | 'project_finish'
  planPhase: string
  period: string
  region: string
  contractValue: string
  settledAmount: string
  progressPercent: string
}

type CreateDefaults = {
  workspaceId: string
  domain: PmDomain
  code: string
  name: string
}

interface EditProps {
  mode?: 'edit'
  project: PmProject
  workItems: PmWorkItem[]
  onClose: () => void
  onSaved: (project: PmProject) => void
}

interface CreateProps {
  mode: 'create'
  createDefaults: CreateDefaults
  workItems?: PmWorkItem[]
  onClose: () => void
  onSaved: (project: PmProject) => void
}

type Props = EditProps | CreateProps

const STATUS_OPTIONS: PmProjectStatus[] = [
  'planning',
  'active',
  'on_hold',
  'completed',
  'archived',
]

function readMetaString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : value != null ? String(value) : ''
}

function readMetaNumber(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return value.trim()
  }
  return ''
}

function emptyDraft(defaults?: Pick<CreateDefaults, 'code' | 'name'>): ProjectInfoDraft {
  return {
    code: defaults?.code ?? '',
    name: defaults?.name ?? '',
    status: 'planning',
    description: '',
    workspaceRoot: '',
    planStart: '',
    planFinish: '',
    statusDate: '',
    scheduleFrom: 'project_start',
    planPhase: '',
    period: '',
    region: '',
    contractValue: '',
    settledAmount: '',
    progressPercent: '',
  }
}

function toDraft(project: PmProject): ProjectInfoDraft {
  const metadata = project.metadata ?? {}
  return {
    code: project.code,
    name: project.name,
    status: project.status,
    description: project.description ?? '',
    workspaceRoot: project.workspaceRoot ?? '',
    planStart: readMetaString(metadata, 'planStartDate'),
    planFinish: readMetaString(metadata, 'planFinishDate'),
    statusDate: readMetaString(metadata, 'statusDate'),
    scheduleFrom:
      readMetaString(metadata, 'scheduleFrom') === 'project_finish'
        ? 'project_finish'
        : 'project_start',
    planPhase: readMetaString(metadata, 'planPhase'),
    period: readMetaString(metadata, 'period'),
    region: readMetaString(metadata, 'region'),
    contractValue: readMetaNumber(metadata, 'contractValue'),
    settledAmount: readMetaNumber(metadata, 'settledAmount'),
    progressPercent: readMetaNumber(metadata, 'progressPercent'),
  }
}

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

function buildMetadata(draft: ProjectInfoDraft, base: Record<string, unknown> = {}): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...base }
  const setMeta = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === '') delete metadata[key]
    else metadata[key] = value
  }
  setMeta('planStartDate', draft.planStart.trim() || undefined)
  setMeta('planFinishDate', draft.planFinish.trim() || undefined)
  setMeta('statusDate', draft.statusDate.trim() || undefined)
  setMeta('scheduleFrom', draft.scheduleFrom)
  setMeta('planPhase', draft.planPhase.trim() || undefined)
  setMeta('period', draft.period.trim() || undefined)
  setMeta('region', draft.region.trim() || undefined)
  setMeta('contractValue', parseOptionalNumber(draft.contractValue))
  setMeta('settledAmount', parseOptionalNumber(draft.settledAmount))
  setMeta('progressPercent', parseOptionalNumber(draft.progressPercent))
  return metadata
}

function computeScheduleBounds(items: PmWorkItem[]): {
  earliestStart: number | null
  latestFinish: number | null
} {
  let earliestStart: number | null = null
  let latestFinish: number | null = null
  for (const item of items) {
    if (item.startDate != null) {
      earliestStart =
        earliestStart == null ? item.startDate : Math.min(earliestStart, item.startDate)
    }
    if (item.dueDate != null) {
      latestFinish = latestFinish == null ? item.dueDate : Math.max(latestFinish, item.dueDate)
    }
  }
  return { earliestStart, latestFinish }
}

function formatDateTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ProjectInfoDialog: FC<Props> = (props) => {
  const { onClose, onSaved } = props
  const isCreate = props.mode === 'create'
  const project = isCreate ? null : props.project
  const workItems = (isCreate ? props.workItems : props.workItems) ?? []
  const createDefaults = isCreate ? props.createDefaults : null

  const { t, language } = useI18n()
  const dateInputLang = getDateLocale(language)
  const datePlaceholder = t('projectManagerPage.projectInfo.datePlaceholder')
  const [activeTab, setActiveTab] = useState<InfoTab>('overview')
  const [draft, setDraft] = useState<ProjectInfoDraft>(() =>
    project ? toDraft(project) : emptyDraft(createDefaults ?? undefined),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (project) {
      setDraft(toDraft(project))
    } else if (createDefaults) {
      setDraft(emptyDraft(createDefaults))
    }
    setError(null)
  }, [
    project,
    createDefaults?.workspaceId,
    createDefaults?.domain,
    createDefaults?.code,
    createDefaults?.name,
  ])

  const stats = useMemo(() => {
    const total = workItems.length
    const milestones = workItems.filter((item) => item.type === 'milestone').length
    const done = workItems.filter((item) => item.status === 'done').length
    const inProgress = workItems.filter((item) => item.status === 'in_progress').length
    const blocked = workItems.filter((item) => item.status === 'blocked').length
    const avgProgress =
      total === 0
        ? 0
        : Math.round(
            workItems.reduce((sum, item) => sum + (item.progressPercent ?? 0), 0) / total,
          )
    const { earliestStart, latestFinish } = computeScheduleBounds(workItems)
    return { total, milestones, done, inProgress, blocked, avgProgress, earliestStart, latestFinish }
  }, [workItems])

  const saveInfo = useMemo(() => {
    const metadata = project?.metadata ?? {}
    return {
      version: readScheduleVersion(metadata),
      lastSavedAt: readLastSavedAt(metadata),
      history: readSaveHistory(metadata),
    }
  }, [project?.metadata])

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

  const patchDraft = (patch: Partial<ProjectInfoDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const handleSave = async () => {
    const code = draft.code.trim()
    const name = draft.name.trim()
    if (!code || !name) {
      setError(t('projectManagerPage.projectInfo.validationRequired'))
      setActiveTab('overview')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isCreate && createDefaults) {
        const created = await pmApi.createProject({
          workspaceId: createDefaults.workspaceId,
          code,
          name,
          status: draft.status,
          domain: createDefaults.domain,
          description: draft.description.trim() || undefined,
          workspaceRoot: draft.workspaceRoot.trim() || undefined,
          metadata: buildMetadata(draft),
        })
        onSaved(created)
        onClose()
        return
      }

      if (!project) return

      const updated = await pmApi.updateProject({
        id: project.id,
        code,
        name,
        status: draft.status,
        description: draft.description.trim() || null,
        workspaceRoot: draft.workspaceRoot.trim() || null,
        metadata: buildMetadata(draft, project.metadata ?? {}),
      })
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const tabs: Array<{ id: InfoTab; label: string }> = [
    { id: 'overview', label: t('projectManagerPage.projectInfo.tabOverview') },
    { id: 'schedule', label: t('projectManagerPage.projectInfo.tabSchedule') },
    { id: 'statistics', label: t('projectManagerPage.projectInfo.tabStatistics') },
    { id: 'advanced', label: t('projectManagerPage.projectInfo.tabAdvanced') },
  ]

  const modalTitle = isCreate
    ? t('projectManagerPage.projectInfo.modalTitleCreate')
    : t('projectManagerPage.projectInfo.modalTitle')

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

            {activeTab === 'overview' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.overviewHint')}</p>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-code">
                    {t('projectManagerPage.projectInfo.fieldCode')}
                  </label>
                  <input
                    id="pm-info-code"
                    className="tm-kb-settings-input"
                    value={draft.code}
                    onChange={(event) => patchDraft({ code: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-name">
                    {t('projectManagerPage.projectInfo.fieldName')}
                  </label>
                  <input
                    id="pm-info-name"
                    className="tm-kb-settings-input"
                    value={draft.name}
                    onChange={(event) => patchDraft({ name: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-status">
                    {t('projectManagerPage.projectInfo.fieldStatus')}
                  </label>
                  <select
                    id="pm-info-status"
                    className="tm-kb-settings-input"
                    value={draft.status}
                    onChange={(event) =>
                      patchDraft({ status: event.target.value as PmProjectStatus })
                    }>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="tm-kb-settings-row tm-kb-settings-row--stack">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-description">
                    {t('projectManagerPage.projectInfo.fieldDescription')}
                  </label>
                  <textarea
                    id="pm-info-description"
                    className="tm-kb-settings-input tm-kb-settings-textarea"
                    rows={4}
                    value={draft.description}
                    onChange={(event) => patchDraft({ description: event.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {activeTab === 'schedule' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.scheduleHint')}</p>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-plan-start">
                    {t('projectManagerPage.projectInfo.fieldPlanStart')}
                  </label>
                  <input
                    id="pm-info-plan-start"
                    className="tm-kb-settings-input"
                    type="date"
                    lang={dateInputLang}
                    placeholder={datePlaceholder}
                    value={draft.planStart}
                    onChange={(event) => patchDraft({ planStart: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-plan-finish">
                    {t('projectManagerPage.projectInfo.fieldPlanFinish')}
                  </label>
                  <input
                    id="pm-info-plan-finish"
                    className="tm-kb-settings-input"
                    type="date"
                    lang={dateInputLang}
                    placeholder={datePlaceholder}
                    value={draft.planFinish}
                    onChange={(event) => patchDraft({ planFinish: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-status-date">
                    {t('projectManagerPage.projectInfo.fieldStatusDate')}
                  </label>
                  <input
                    id="pm-info-status-date"
                    className="tm-kb-settings-input"
                    type="date"
                    lang={dateInputLang}
                    placeholder={datePlaceholder}
                    value={draft.statusDate}
                    onChange={(event) => patchDraft({ statusDate: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-schedule-from">
                    {t('projectManagerPage.projectInfo.fieldScheduleFrom')}
                  </label>
                  <select
                    id="pm-info-schedule-from"
                    className="tm-kb-settings-input"
                    value={draft.scheduleFrom}
                    onChange={(event) =>
                      patchDraft({
                        scheduleFrom: event.target.value as 'project_start' | 'project_finish',
                      })
                    }>
                    <option value="project_start">
                      {t('projectManagerPage.projectInfo.scheduleFromStart')}
                    </option>
                    <option value="project_finish">
                      {t('projectManagerPage.projectInfo.scheduleFromFinish')}
                    </option>
                  </select>
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-plan-phase">
                    {t('projectManagerPage.projectInfo.fieldPlanPhase')}
                  </label>
                  <input
                    id="pm-info-plan-phase"
                    className="tm-kb-settings-input"
                    value={draft.planPhase}
                    onChange={(event) => patchDraft({ planPhase: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-period">
                    {t('projectManagerPage.projectInfo.fieldPeriod')}
                  </label>
                  <input
                    id="pm-info-period"
                    className="tm-kb-settings-input"
                    value={draft.period}
                    onChange={(event) => patchDraft({ period: event.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {activeTab === 'statistics' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">
                  {t('projectManagerPage.projectInfo.statisticsHint')}
                </p>
                <div className="tm-pm-project-info-stats">
                  <div className="tm-pm-project-info-stat">
                    <span className="tm-pm-project-info-stat-label">
                      {t('projectManagerPage.projectInfo.statTasks')}
                    </span>
                    <strong>{stats.total}</strong>
                  </div>
                  <div className="tm-pm-project-info-stat">
                    <span className="tm-pm-project-info-stat-label">
                      {t('projectManagerPage.projectInfo.statMilestones')}
                    </span>
                    <strong>{stats.milestones}</strong>
                  </div>
                  <div className="tm-pm-project-info-stat">
                    <span className="tm-pm-project-info-stat-label">
                      {t('projectManagerPage.projectInfo.statDone')}
                    </span>
                    <strong>{stats.done}</strong>
                  </div>
                  <div className="tm-pm-project-info-stat">
                    <span className="tm-pm-project-info-stat-label">
                      {t('projectManagerPage.projectInfo.statInProgress')}
                    </span>
                    <strong>{stats.inProgress}</strong>
                  </div>
                  <div className="tm-pm-project-info-stat">
                    <span className="tm-pm-project-info-stat-label">
                      {t('projectManagerPage.projectInfo.statBlocked')}
                    </span>
                    <strong>{stats.blocked}</strong>
                  </div>
                  <div className="tm-pm-project-info-stat">
                    <span className="tm-pm-project-info-stat-label">
                      {t('projectManagerPage.projectInfo.statAvgProgress')}
                    </span>
                    <strong>{stats.avgProgress}%</strong>
                  </div>
                  <div className="tm-pm-project-info-stat">
                    <span className="tm-pm-project-info-stat-label">
                      {t('projectManagerPage.projectInfo.statEarliestStart')}
                    </span>
                    <strong>
                      {stats.earliestStart != null
                        ? formatWorkItemDate(stats.earliestStart)
                        : '—'}
                    </strong>
                  </div>
                  <div className="tm-pm-project-info-stat">
                    <span className="tm-pm-project-info-stat-label">
                      {t('projectManagerPage.projectInfo.statLatestFinish')}
                    </span>
                    <strong>
                      {stats.latestFinish != null
                        ? formatWorkItemDate(stats.latestFinish)
                        : '—'}
                    </strong>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'advanced' ? (
              <div className="tm-kb-settings-form">
                <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.advancedHint')}</p>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-region">
                    {t('projectManagerPage.projectInfo.fieldRegion')}
                  </label>
                  <input
                    id="pm-info-region"
                    className="tm-kb-settings-input"
                    value={draft.region}
                    onChange={(event) => patchDraft({ region: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-contract">
                    {t('projectManagerPage.projectInfo.fieldContractValue')}
                  </label>
                  <input
                    id="pm-info-contract"
                    className="tm-kb-settings-input"
                    value={draft.contractValue}
                    onChange={(event) => patchDraft({ contractValue: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-settled">
                    {t('projectManagerPage.projectInfo.fieldSettledAmount')}
                  </label>
                  <input
                    id="pm-info-settled"
                    className="tm-kb-settings-input"
                    value={draft.settledAmount}
                    onChange={(event) => patchDraft({ settledAmount: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-progress">
                    {t('projectManagerPage.projectInfo.fieldProgressPercent')}
                  </label>
                  <input
                    id="pm-info-progress"
                    className="tm-kb-settings-input"
                    value={draft.progressPercent}
                    onChange={(event) => patchDraft({ progressPercent: event.target.value })}
                  />
                </div>
                <div className="tm-kb-settings-row">
                  <label className="tm-kb-settings-label" htmlFor="pm-info-root">
                    {t('projectManagerPage.projectInfo.fieldWorkspaceRoot')}
                  </label>
                  <input
                    id="pm-info-root"
                    className="tm-kb-settings-input"
                    value={draft.workspaceRoot}
                    onChange={(event) => patchDraft({ workspaceRoot: event.target.value })}
                  />
                </div>
                {!isCreate && project ? (
                  <div className="tm-kb-settings-row">
                    <label className="tm-kb-settings-label">
                      {t('projectManagerPage.projectInfo.fieldUpdatedAt')}
                    </label>
                    <span className="tm-kb-settings-readonly">
                      {formatWorkItemDate(project.updatedAt)}
                    </span>
                  </div>
                ) : null}
                {!isCreate && project ? (
                  <>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldScheduleVersion')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {saveInfo.version > 0
                          ? t('projectManagerPage.projectInfo.saveHistoryVersion', {
                              version: String(saveInfo.version),
                            })
                          : t('projectManagerPage.projectInfo.scheduleVersionNever')}
                      </span>
                    </div>
                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldLastSavedAt')}
                      </label>
                      <span className="tm-kb-settings-readonly">
                        {saveInfo.lastSavedAt != null
                          ? formatDateTime(saveInfo.lastSavedAt, dateInputLang)
                          : '—'}
                      </span>
                    </div>
                    <div className="tm-kb-settings-row tm-kb-settings-row--block">
                      <label className="tm-kb-settings-label">
                        {t('projectManagerPage.projectInfo.fieldSaveHistory')}
                      </label>
                      {saveInfo.history.length === 0 ? (
                        <span className="tm-kb-settings-readonly">
                          {t('projectManagerPage.projectInfo.saveHistoryEmpty')}
                        </span>
                      ) : (
                        <ul className="tm-pm-project-info-save-history">
                          {saveInfo.history.map((entry) => (
                            <li key={`${entry.version}-${entry.savedAt}`}>
                              <span>
                                {t('projectManagerPage.projectInfo.saveHistoryVersion', {
                                  version: String(entry.version),
                                })}
                              </span>
                              <span>{formatDateTime(entry.savedAt, dateInputLang)}</span>
                              <span>
                                {t('projectManagerPage.projectInfo.saveHistoryTasks', {
                                  count: String(entry.workItemCount),
                                })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="tm-kb-settings-modal-footer">
          <div className="tm-kb-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
              onClick={onClose}
              disabled={saving}>
              {t('projectManagerPage.database.cancel')}
            </button>
            <button
              type="button"
              className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
              onClick={() => void handleSave()}
              disabled={saving}>
              {saving
                ? t('projectManagerPage.projectInfo.saving')
                : isCreate
                  ? t('projectManagerPage.projectInfo.confirmCreate')
                  : t('projectManagerPage.database.save')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default ProjectInfoDialog
