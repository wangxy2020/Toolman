import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Archive, Building2, FileText, FolderOpen } from 'lucide-react'

import type { PmDocumentLink, PmWorkItem } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import type { KpiCardModel } from '../../dashboard/dashboard-types'
import { PmKpiGrid } from '../../dashboard/PmKpiGrid'
import { pmApi } from '../../pm-api'

interface Props {
  workspaceId: string
}

const ProjectArchiveStatsPanel: FC<Props> = ({ workspaceId }) => {
  const { t } = useI18n()
  const [links, setLinks] = useState<PmDocumentLink[]>([])
  const [items, setItems] = useState<PmWorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [linkResult, itemResult] = await Promise.all([
        pmApi.listDocumentLinks(workspaceId),
        pmApi.listWorkItems({ workspaceId, domain: 'archive_management', limit: 1000 }),
      ])
      setLinks(linkResult.links)
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

  const openItems = useMemo(
    () => items.filter((item) => item.status !== 'done' && item.status !== 'cancelled'),
    [items],
  )

  const kpiCards = useMemo((): KpiCardModel[] => {
    return [
      {
        key: 'links',
        label: t('projectManagerPage.archiveStats.kpi.links'),
        value: `${links.length}`,
        sub: t('projectManagerPage.archiveStats.kpiSub.links'),
        trend: null,
        delta: '',
        icon: <FileText size={18} />,
      },
      {
        key: 'openItems',
        label: t('projectManagerPage.archiveStats.kpi.openItems'),
        value: `${openItems.length}`,
        sub: t('projectManagerPage.archiveStats.kpiSub.openItems'),
        trend: null,
        delta: '',
        icon: <FolderOpen size={18} />,
      },
      {
        key: 'archive',
        label: t('projectManagerPage.documentLinks.columns.category'),
        value: `${items.length}`,
        sub: t('projectManagerPage.archiveStats.kpiSub.totalItems'),
        trend: null,
        delta: '',
        icon: <Archive size={18} />,
      },
      {
        key: 'projects',
        label: t('projectManagerPage.vertical.kpi.projects'),
        value: `${new Set(items.map((item) => item.projectId)).size}`,
        sub: t('projectManagerPage.archiveStats.kpiSub.projects'),
        trend: null,
        delta: '',
        icon: <Building2 size={18} />,
      },
    ]
  }, [items, links.length, openItems.length, t])

  if (loading) {
    return <div className="tm-pm-empty">{t('projectManagerPage.archiveStats.loading')}</div>
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

export default ProjectArchiveStatsPanel
