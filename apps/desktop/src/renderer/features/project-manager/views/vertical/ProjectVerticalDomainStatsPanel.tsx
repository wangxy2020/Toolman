import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  AlertTriangle,
  Building2,
  Ban,
  CheckSquare,
  Layers,
} from 'lucide-react'

import {
  buildPmProjectDashboardRecords,
  type PmDomain,
  type PmProject,
  type PmWorkItem,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import type { KpiCardModel } from '../../dashboard/dashboard-types'
import { buildMockPmDashboardData } from '../../dashboard/usePmDashboardData'
import { PmKpiGrid } from '../../dashboard/PmKpiGrid'
import { ProjectCard } from '../../dashboard/ProjectCard'
import { pmApi } from '../../pm-api'

interface Props {
  workspaceId: string
  domain: PmDomain
}

function isOpen(item: PmWorkItem): boolean {
  return item.status !== 'done' && item.status !== 'cancelled'
}

const ProjectVerticalDomainStatsPanel: FC<Props> = ({ workspaceId, domain }) => {
  const { t } = useI18n()
  const [projects, setProjects] = useState<PmProject[]>([])
  const [items, setItems] = useState<PmWorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [projectResult, itemResult] = await Promise.all([
        pmApi.listProjects(workspaceId, domain),
        pmApi.listWorkItems({ workspaceId, domain, limit: 1000 }),
      ])
      setProjects(projectResult.projects)
      setItems(itemResult.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [domain, workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const openItems = useMemo(() => items.filter(isOpen), [items])
  const urgentItems = useMemo(
    () => openItems.filter((item) => item.priority === 'urgent' || item.priority === 'high').length,
    [openItems],
  )
  const blockedItems = useMemo(
    () => openItems.filter((item) => item.status === 'blocked').length,
    [openItems],
  )
  const avgProgress = useMemo(() => {
    if (items.length === 0) return 0
    return items.reduce((sum, item) => sum + item.progressPercent, 0) / items.length
  }, [items])

  const projectRecords = useMemo(() => {
    if (projects.length === 0) {
      return buildMockPmDashboardData().records.slice(0, 4)
    }
    const projectIds = new Set(projects.map((project) => project.id))
    const scopedItems = items.filter((item) => projectIds.has(item.projectId))
    return buildPmProjectDashboardRecords(projects, scopedItems).slice(0, 4)
  }, [items, projects])

  const kpiCards = useMemo((): KpiCardModel[] => {
    return [
      {
        key: 'projects',
        label: t('projectManagerPage.vertical.kpi.projects'),
        value: `${projects.length}`,
        sub: t('projectManagerPage.vertical.kpiSub.projects'),
        trend: null,
        delta: '',
        icon: <Building2 size={18} />,
      },
      {
        key: 'open',
        label: t('projectManagerPage.vertical.kpi.openItems'),
        value: `${openItems.length}`,
        sub: t('projectManagerPage.vertical.kpiSub.openItems'),
        trend: null,
        delta: '',
        icon: <CheckSquare size={18} />,
      },
      {
        key: 'urgent',
        label: t('projectManagerPage.vertical.kpi.urgent'),
        value: `${urgentItems}`,
        sub: t('projectManagerPage.vertical.kpiSub.urgent'),
        trend: urgentItems > 0 ? 'up' : null,
        delta: '',
        icon: <AlertTriangle size={18} />,
      },
      {
        key: 'blocked',
        label: t('projectManagerPage.vertical.kpi.blocked'),
        value: `${blockedItems}`,
        sub: t('projectManagerPage.vertical.kpiSub.blocked'),
        trend: blockedItems > 0 ? 'up' : null,
        delta: '',
        icon: <Ban size={18} />,
      },
      {
        key: 'progress',
        label: t('projectManagerPage.vertical.kpi.avgProgress'),
        value: `${avgProgress.toFixed(0)}%`,
        sub: t('projectManagerPage.vertical.kpiSub.avgProgress'),
        trend: null,
        delta: '',
        icon: <Layers size={18} />,
      },
    ]
  }, [avgProgress, blockedItems, openItems.length, projects.length, t, urgentItems])

  if (loading && projects.length === 0 && items.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.vertical.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  return (
    <div className="tm-pm-dashboard">
      <PmKpiGrid cards={kpiCards} />

      {projectRecords.length > 0 ? (
        <section className="tm-pm-section">
          <div className="tm-pm-section-head">
            <h3 className="tm-pm-section-title">{t('projectManagerPage.vertical.projectsTitle')}</h3>
            <span className="tm-pm-section-desc">{t('projectManagerPage.vertical.projectsDesc')}</span>
          </div>
          <div className="tm-pm-project-grid">
            {projectRecords.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                variant="progress"
                prefix="projectManagerPage.dashboard.progress"
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default ProjectVerticalDomainStatsPanel
