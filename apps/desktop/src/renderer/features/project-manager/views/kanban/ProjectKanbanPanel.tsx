import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  AlertTriangle,
  Ban,
  Building2,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  ListTodo,
  TrendingUp,
} from 'lucide-react'

import { MOCK_EPC_PROJECTS, type PmProject, type PmWorkItem } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import type { KpiCardModel } from '../../dashboard/dashboard-types'
import { PmKpiGrid } from '../../dashboard/PmKpiGrid'
import { ProjectCard } from '../../dashboard/ProjectCard'
import { pmApi } from '../../pm-api'
import { UrgentWorkItemCard } from './UrgentWorkItemCard'
import {
  buildUrgentTodoStats,
  pickImportantWorkItems,
  toUrgentItemCard,
} from './pm-urgent-stats'

interface Props {
  workspaceId: string
}

const ProjectKanbanPanel: FC<Props> = ({ workspaceId }) => {
  const { t } = useI18n()
  const [items, setItems] = useState<PmWorkItem[]>([])
  const [projects, setProjects] = useState<PmProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [itemResult, projectResult] = await Promise.all([
        pmApi.listUrgentWorkItems(workspaceId),
        pmApi.listProjects(workspaceId),
      ])
      setItems(itemResult.items)
      setProjects(projectResult.projects)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const stats = useMemo(() => buildUrgentTodoStats(items, projects), [items, projects])
  const importantItems = useMemo(
    () => pickImportantWorkItems(items).map((item) => toUrgentItemCard(item, projects)),
    [items, projects],
  )
  const useMockItems = importantItems.length === 0

  const kpiCards = useMemo((): KpiCardModel[] => {
    const openCount = useMockItems ? MOCK_EPC_PROJECTS.length : stats.openCount
    const urgentCount = useMockItems
      ? MOCK_EPC_PROJECTS.filter((item) => item.status !== 'normal').length
      : stats.urgentCount
    const overdueCount = useMockItems
      ? MOCK_EPC_PROJECTS.filter((item) => item.status === 'critical').length
      : stats.overdueCount
    const blockedCount = useMockItems
      ? MOCK_EPC_PROJECTS.filter((item) => item.status === 'critical').length
      : stats.blockedCount
    const inProgressCount = useMockItems
      ? MOCK_EPC_PROJECTS.filter((item) => item.progressPercent > 0 && item.progressPercent < 100)
          .length
      : stats.inProgressCount
    const projectCount = useMockItems ? MOCK_EPC_PROJECTS.length : stats.projectCount

    return [
      {
        key: 'open',
        label: t('projectManagerPage.urgent.kpi.open'),
        value: `${openCount}`,
        sub: t('projectManagerPage.urgent.kpiSub.open'),
        trend: null,
        delta: '',
        icon: <ListTodo size={18} />,
      },
      {
        key: 'urgent',
        label: t('projectManagerPage.urgent.kpi.urgent'),
        value: `${urgentCount}`,
        sub: t('projectManagerPage.urgent.kpiSub.urgent'),
        trend: urgentCount > 0 ? 'up' : null,
        delta: '',
        icon: <AlertTriangle size={18} />,
      },
      {
        key: 'overdue',
        label: t('projectManagerPage.urgent.kpi.overdue'),
        value: `${overdueCount}`,
        sub: t('projectManagerPage.urgent.kpiSub.overdue'),
        trend: overdueCount > 0 ? 'up' : null,
        delta: '',
        icon: <CalendarClock size={18} />,
      },
      {
        key: 'blocked',
        label: t('projectManagerPage.urgent.kpi.blocked'),
        value: `${blockedCount}`,
        sub: t('projectManagerPage.urgent.kpiSub.blocked'),
        trend: blockedCount > 0 ? 'up' : null,
        delta: '',
        icon: <Ban size={18} />,
      },
      {
        key: 'inProgress',
        label: t('projectManagerPage.urgent.kpi.inProgress'),
        value: `${inProgressCount}`,
        sub: t('projectManagerPage.urgent.kpiSub.inProgress'),
        trend: null,
        delta: '',
        icon: <CheckSquare size={18} />,
      },
      {
        key: 'projects',
        label: t('projectManagerPage.urgent.kpi.projects'),
        value: `${projectCount}`,
        sub: t('projectManagerPage.urgent.kpiSub.projects'),
        trend: null,
        delta: '',
        icon: <Building2 size={18} />,
      },
    ]
  }, [stats, t, useMockItems])

  const healthPercent = useMockItems
    ? Math.round(
        (MOCK_EPC_PROJECTS.filter((item) => item.status === 'normal').length /
          MOCK_EPC_PROJECTS.length) *
          100,
      )
    : stats.healthPercent
  const avgProgress = useMockItems
    ? MOCK_EPC_PROJECTS.reduce((sum, item) => sum + item.progressPercent, 0) /
      MOCK_EPC_PROJECTS.length
    : stats.avgProgress

  if (loading && items.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.urgent.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  return (
    <div className="tm-pm-dashboard">
      <PmKpiGrid cards={kpiCards} />

      <section className="tm-pm-section">
        <div className="tm-pm-section-head">
          <h3 className="tm-pm-section-title">{t('projectManagerPage.urgent.itemsTitle')}</h3>
          <span className="tm-pm-section-desc">{t('projectManagerPage.urgent.itemsDesc')}</span>
        </div>
        <div className="tm-pm-project-grid tm-pm-project-grid--six">
          {useMockItems
            ? MOCK_EPC_PROJECTS.slice(0, 6).map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  variant="progress"
                  prefix="projectManagerPage.dashboard.progress"
                />
              ))
            : importantItems.map((item) => <UrgentWorkItemCard key={item.id} item={item} />)}
        </div>
      </section>

      <div className="tm-pm-insight-grid">
        <div className="tm-pm-insight-card">
          <div className="tm-pm-insight-title">
            <ClipboardList size={16} />
            {t('projectManagerPage.urgent.insightHealth.title')}
          </div>
          <div className="tm-pm-insight-value">{healthPercent}%</div>
          <p className="tm-pm-insight-desc">{t('projectManagerPage.urgent.insightHealth.desc')}</p>
        </div>
        <div className="tm-pm-insight-card">
          <div className="tm-pm-insight-title">
            <TrendingUp size={16} />
            {t('projectManagerPage.urgent.insightProgress.title')}
          </div>
          <div className="tm-pm-insight-value">{avgProgress.toFixed(0)}%</div>
          <p className="tm-pm-insight-desc">{t('projectManagerPage.urgent.insightProgress.desc')}</p>
        </div>
      </div>
    </div>
  )
}

export default ProjectKanbanPanel
