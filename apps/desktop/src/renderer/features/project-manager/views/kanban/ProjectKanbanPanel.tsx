import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  AlertTriangle,
  Building2,
  CheckSquare,
  Layers,
  ListTodo,
} from 'lucide-react'

import type { PmProject, PmWorkItem } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import type { KpiCardModel } from '../../dashboard/dashboard-types'
import { PmKpiGrid } from '../../dashboard/PmKpiGrid'
import { pmApi } from '../../pm-api'

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

  const openItems = useMemo(
    () => items.filter((item) => item.status !== 'done' && item.status !== 'cancelled'),
    [items],
  )

  const kpiCards = useMemo((): KpiCardModel[] => {
    const urgentCount = openItems.filter(
      (item) => item.priority === 'urgent' || item.priority === 'high',
    ).length
    const blockedCount = openItems.filter((item) => item.status === 'blocked').length
    return [
      {
        key: 'open',
        label: t('projectManagerPage.workbench.kpi.openItems'),
        value: `${openItems.length}`,
        sub: t('projectManagerPage.urgent.kpiSub.open'),
        trend: null,
        delta: '',
        icon: <ListTodo size={18} />,
      },
      {
        key: 'urgent',
        label: t('projectManagerPage.workbench.kpi.urgent'),
        value: `${urgentCount}`,
        sub: t('projectManagerPage.urgent.kpiSub.urgent'),
        trend: urgentCount > 0 ? 'up' : null,
        delta: '',
        icon: <AlertTriangle size={18} />,
      },
      {
        key: 'blocked',
        label: t('projectManagerPage.vertical.kpi.blocked'),
        value: `${blockedCount}`,
        sub: t('projectManagerPage.urgent.kpiSub.blocked'),
        trend: blockedCount > 0 ? 'up' : null,
        delta: '',
        icon: <Layers size={18} />,
      },
      {
        key: 'projects',
        label: t('projectManagerPage.workbench.kpi.projects'),
        value: `${projects.length}`,
        sub: t('projectManagerPage.urgent.kpiSub.projects'),
        trend: null,
        delta: '',
        icon: <Building2 size={18} />,
      },
      {
        key: 'inProgress',
        label: t('projectManagerPage.kanban.columns.in_progress'),
        value: `${openItems.filter((item) => item.status === 'in_progress').length}`,
        sub: t('projectManagerPage.urgent.kpiSub.inProgress'),
        trend: null,
        delta: '',
        icon: <CheckSquare size={18} />,
      },
    ]
  }, [openItems, projects.length, t])

  if (loading && items.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.kanban.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  return (
    <div className="tm-pm-dashboard">
      <PmKpiGrid cards={kpiCards} />
    </div>
  )
}

export default ProjectKanbanPanel
