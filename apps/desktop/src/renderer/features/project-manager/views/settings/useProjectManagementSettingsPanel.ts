import { useCallback, useEffect, useState } from 'react'

import {
  getPmDomainCustomFields,
  type PmDomain,
  type PmDomainSettings,
  type PmProject,
  type PmProjectStatus,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import {
  SIDEBAR_MENU_I18N_KEY,
  type ConfigurableSidebarMenuKey,
} from '../../projectSidebarMenuConfig'
import { resolvePmDatabaseListDomain } from '../../pm-domain-config'
import {
  loadGanttUiPrefs,
  saveGanttUiPrefs,
  type GanttDateHeaderMode,
  type GanttTaskColors,
  type GanttUiPrefs,
} from '../schedule/pm-gantt-prefs'
import { clearPmPlanAppliedProject } from '../../ProjectPlanAgentApplyBar'

export type SettingsTab = 'gantt' | 'calendar' | 'projects'

export interface ProjectManagementSettingsPanelProps {
  workspaceId: string
  domain: ConfigurableSidebarMenuKey
  onClose: () => void
  onProjectsChange?: () => void
}

export const HEADER_MODE_OPTIONS: GanttDateHeaderMode[] = [
  'day',
  'week',
  'month',
  'year',
  'month_day',
  'year_month',
  'year_month_day',
]

export const COLOR_FIELDS: Array<{ key: keyof GanttTaskColors; labelKey: string }> = [
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

export function useProjectManagementSettingsPanel({
  workspaceId,
  domain,
  onClose,
  onProjectsChange,
}: ProjectManagementSettingsPanelProps) {
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

  const handleSave = useCallback(() => {
    if (!isPlanSettings) {
      onClose()
      return
    }
    saveGanttUiPrefs(draft)
    window.dispatchEvent(new Event('tm-pm-gantt-prefs'))
    onClose()
  }, [draft, isPlanSettings, onClose])

  const handleCancel = useCallback(() => {
    onClose()
  }, [onClose])

  const statusLabel = useCallback(
    (status: PmProjectStatus): string => {
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
    },
    [t],
  )

  const handleDeleteProject = useCallback(
    async (project: PmProject) => {
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
    },
    [onProjectsChange, workspaceId],
  )

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'gantt', label: t('projectManagerPage.domainSettings.tabGantt') },
    { id: 'calendar', label: t('projectManagerPage.domainSettings.tabCalendar') },
    { id: 'projects', label: t('projectManagerPage.domainSettings.tabProjects') },
  ]

  const headerModeLabel = useCallback(
    (mode: GanttDateHeaderMode): string => {
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
    },
    [t],
  )

  return {
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
  }
}
