import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  formatProjectMoney,
  resolvePmProjectDashboardRecord,
  type PmProject,
  type PmWorkItem,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'

interface Props {
  workspaceId: string
}

const ProjectCostDatabasePanel: FC<Props> = ({ workspaceId }) => {
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
        pmApi.listProjects(workspaceId, 'cost_management'),
        pmApi.listWorkItems({
          workspaceId,
          domain: 'cost_management',
          limit: 1000,
        }),
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

  const ledgerRows = useMemo(() => {
    const itemsByProject = new Map<string, PmWorkItem[]>()
    for (const item of items) {
      const bucket = itemsByProject.get(item.projectId)
      if (bucket) {
        bucket.push(item)
      } else {
        itemsByProject.set(item.projectId, [item])
      }
    }
    return projects.map((project) =>
      resolvePmProjectDashboardRecord(project, itemsByProject.get(project.id) ?? []),
    )
  }, [items, projects])

  if (loading && projects.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.database.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  return (
    <div className="tm-pm-cost-database">
      <h3>{t('projectManagerPage.costDatabase.ledgerTitle')}</h3>
      {ledgerRows.length === 0 ? (
        <div className="tm-pm-empty">{t('projectManagerPage.dashboard.empty')}</div>
      ) : (
        <table className="tm-pm-database-table">
          <thead>
            <tr>
              <th>{t('projectManagerPage.costDatabase.columns.code')}</th>
              <th>{t('projectManagerPage.costDatabase.columns.name')}</th>
              <th>{t('projectManagerPage.costDatabase.columns.contract')}</th>
              <th>{t('projectManagerPage.costDatabase.columns.settled')}</th>
              <th>{t('projectManagerPage.costDatabase.columns.pending')}</th>
              <th>{t('projectManagerPage.costDatabase.columns.progress')}</th>
              <th>{t('projectManagerPage.costDatabase.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((project) => (
              <tr key={project.id}>
                <td>{project.code}</td>
                <td>{project.name}</td>
                <td>{formatProjectMoney(project.contractValue)}</td>
                <td>{formatProjectMoney(project.settledAmount)}</td>
                <td>{formatProjectMoney(project.pendingAmount)}</td>
                <td>{project.progressPercent}%</td>
                <td>{project.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{t('projectManagerPage.costDatabase.workItemsTitle')}</h3>
      {items.length === 0 ? (
        <div className="tm-pm-empty">{t('projectManagerPage.database.empty')}</div>
      ) : (
        <table className="tm-pm-database-table">
          <thead>
            <tr>
              <th>{t('projectManagerPage.database.columns.title')}</th>
              <th>{t('projectManagerPage.database.columns.status')}</th>
              <th>{t('projectManagerPage.database.columns.priority')}</th>
              <th>{t('projectManagerPage.database.columns.progress')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{item.status}</td>
                <td>{item.priority}</td>
                <td>{item.progressPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default ProjectCostDatabasePanel
