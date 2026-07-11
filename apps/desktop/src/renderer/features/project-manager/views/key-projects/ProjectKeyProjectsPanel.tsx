import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AlertTriangle, Building2, Handshake, Layers } from 'lucide-react'

import {
  buildPmProjectDashboardRecords,
  type EpcProjectRecord,
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
  workspaceId?: string
}

function isOpen(item: PmWorkItem): boolean {
  return item.status !== 'done' && item.status !== 'cancelled'
}

function isAtRiskRecord(record: EpcProjectRecord): boolean {
  return record.status === 'warning' || record.status === 'critical'
}

const ProjectKeyProjectsPanel: FC<Props> = ({ workspaceId }) => {
  const { t } = useI18n()
  const [projects, setProjects] = useState<PmProject[]>([])
  const [items, setItems] = useState<PmWorkItem[]>([])
  const [loading, setLoading] = useState(Boolean(workspaceId))
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!workspaceId) {
      setProjects([])
      setItems([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [projectResult, itemResult] = await Promise.all([
        pmApi.listProjects(workspaceId, 'key_projects'),
        pmApi.listWorkItems({ workspaceId, domain: 'key_projects', limit: 1000 }),
      ])
      setProjects(projectResult.projects)
      setItems(itemResult.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const mockRecords = useMemo(() => buildMockPmDashboardData().records, [])
  const records = useMemo(() => {
    if (projects.length === 0) {
      return mockRecords
    }
    const projectIds = new Set(projects.map((project) => project.id))
    const scopedItems = items.filter((item) => projectIds.has(item.projectId))
    return buildPmProjectDashboardRecords(projects, scopedItems)
  }, [items, mockRecords, projects])

  const atRiskRecords = useMemo(() => records.filter(isAtRiskRecord), [records])
  const coordinationItems = useMemo(
    () => items.filter(isOpen).slice(0, 12),
    [items],
  )

  const kpiCards = useMemo((): KpiCardModel[] => {
    return [
      {
        key: 'portfolio',
        label: t('projectManagerPage.keyProjects.kpi.portfolio'),
        value: `${records.length}`,
        sub: t('projectManagerPage.keyProjects.kpiSub.portfolio'),
        trend: null,
        delta: '',
        icon: <Building2 size={18} />,
      },
      {
        key: 'atRisk',
        label: t('projectManagerPage.keyProjects.kpi.atRisk'),
        value: `${atRiskRecords.length}`,
        sub: t('projectManagerPage.keyProjects.kpiSub.atRisk'),
        trend: atRiskRecords.length > 0 ? 'up' : null,
        delta: '',
        icon: <AlertTriangle size={18} />,
      },
      {
        key: 'coordination',
        label: t('projectManagerPage.keyProjects.kpi.coordination'),
        value: `${coordinationItems.length}`,
        sub: t('projectManagerPage.keyProjects.kpiSub.coordination'),
        trend: null,
        delta: '',
        icon: <Handshake size={18} />,
      },
      {
        key: 'progress',
        label: t('projectManagerPage.vertical.kpi.avgProgress'),
        value: `${records.length > 0 ? Math.round(records.reduce((sum, record) => sum + record.progressPercent, 0) / records.length) : 0}%`,
        sub: t('projectManagerPage.vertical.kpiSub.avgProgress'),
        trend: 'up',
        delta: '',
        icon: <Layers size={18} />,
      },
    ]
  }, [atRiskRecords.length, coordinationItems.length, records, t])

  if (loading && projects.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.keyProjects.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  const prefix = 'projectManagerPage.dashboard.progress'

  return (
    <div className="tm-pm-dashboard">
      <PmKpiGrid cards={kpiCards} />

      {atRiskRecords.length > 0 ? (
        <section className="tm-pm-section">
          <div className="tm-pm-section-head">
            <h3 className="tm-pm-section-title">{t('projectManagerPage.keyProjects.riskTitle')}</h3>
            <span className="tm-pm-section-desc">{t('projectManagerPage.keyProjects.riskDesc')}</span>
          </div>
          <div className="tm-pm-project-grid">
            {atRiskRecords.slice(0, 4).map((project) => (
              <ProjectCard key={project.id} project={project} variant="progress" prefix={prefix} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default ProjectKeyProjectsPanel
