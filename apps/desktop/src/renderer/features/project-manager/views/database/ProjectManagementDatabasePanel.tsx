import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildPmWorkItemForest,
  flattenPmWorkItemForest,
  getPmDomainCustomFields,
  type PmDomain,
  type PmProject,
  type PmWorkItem,
  type PmWorkItemPriority,
  type PmWorkItemStatus,
  type PmWorkItemType,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import {
  isPmDatabaseDomain,
  resolvePmDatabaseListDomain,
} from '../../pm-domain-config'
import type { ConfigurableSidebarMenuKey } from '../../projectSidebarMenuConfig'

interface Props {
  workspaceId: string
  domain: ConfigurableSidebarMenuKey
  projects: PmProject[]
  selectedProjectId: string | null
}

export { isPmDatabaseDomain }

type Draft = {
  title: string
  type: PmWorkItemType
  status: PmWorkItemStatus
  priority: PmWorkItemPriority
  assignee: string
  description: string
  progressPercent: number
  parentId: string
  startDate: string
  dueDate: string
  metadata: Record<string, string>
}

const EMPTY_DRAFT: Draft = {
  title: '',
  type: 'task',
  status: 'todo',
  priority: 'normal',
  assignee: '',
  description: '',
  progressPercent: 0,
  parentId: '',
  startDate: '',
  dueDate: '',
  metadata: {},
}

function toDraft(item?: PmWorkItem | null, fieldKeys: string[] = []): Draft {
  if (!item) return { ...EMPTY_DRAFT }
  const metadata: Record<string, string> = {}
  for (const key of fieldKeys) {
    const value = item.metadata[key]
    if (value == null) continue
    metadata[key] = typeof value === 'number' ? String(value) : String(value)
  }
  return {
    title: item.title,
    type: item.type,
    status: item.status,
    priority: item.priority,
    assignee: item.assignee ?? '',
    description: item.description ?? '',
    progressPercent: item.progressPercent,
    parentId: item.parentId ?? '',
    startDate: item.startDate ? new Date(item.startDate).toISOString().slice(0, 10) : '',
    dueDate: item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : '',
    metadata,
  }
}

function buildMetadataPayload(
  draft: Draft,
  customFields: ReturnType<typeof getPmDomainCustomFields>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  for (const field of customFields) {
    const raw = draft.metadata[field.key]?.trim()
    if (!raw) continue
    if (field.type === 'number') {
      const parsed = Number.parseFloat(raw)
      if (Number.isFinite(parsed)) metadata[field.key] = parsed
      continue
    }
    if (field.type === 'date') {
      metadata[field.key] = new Date(raw).getTime()
      continue
    }
    metadata[field.key] = raw
  }
  return metadata
}

const ProjectManagementDatabasePanel: FC<Props> = ({
  workspaceId,
  domain,
  projects,
  selectedProjectId,
}) => {
  const { t, language } = useI18n()
  const listDomain = resolvePmDatabaseListDomain(domain)
  const customFields = useMemo(
    () => (listDomain ? getPmDomainCustomFields(listDomain) : []),
    [listDomain],
  )
  const [items, setItems] = useState<PmWorkItem[]>([])
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(false)

  const treeRows = useMemo(() => {
    const scopedItems =
      domain === 'urgent_tasks'
        ? items.filter(
            (item) =>
              (item.priority === 'urgent' || item.priority === 'high') &&
              item.status !== 'done' &&
              item.status !== 'cancelled',
          )
        : items
    return flattenPmWorkItemForest(buildPmWorkItemForest(scopedItems))
  }, [domain, items])

  const parentOptions = useMemo(
    () => items.filter((item) => item.id !== editingId),
    [editingId, items],
  )

  const reload = useCallback(async () => {
    setError(null)
    if (!hasDataRef.current) {
      setLoading(true)
    }
    try {
      if (domain === 'urgent_tasks') {
        const itemResult = await pmApi.listUrgentWorkItems(workspaceId)
        setItems(itemResult.items)
        hasDataRef.current = true
        return
      }

      if (!selectedProjectId) {
        setItems([])
        hasDataRef.current = true
        return
      }

      const itemResult = await pmApi.listWorkItems({
        workspaceId,
        projectId: selectedProjectId,
        domain: listDomain,
        limit: 1000,
      })
      setItems(itemResult.items)
      hasDataRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [domain, listDomain, selectedProjectId, workspaceId])

  useEffect(() => {
    hasDataRef.current = false
    void reload()
  }, [reload])

  const resetDraft = () => {
    setEditingId(null)
    setDraft({ ...EMPTY_DRAFT })
  }

  const handleSave = async () => {
    const trimmed = draft.title.trim()
    if (!trimmed) return

    if (domain === 'urgent_tasks') {
      if (!editingId) return
      await pmApi.updateWorkItem({
        id: editingId,
        title: trimmed,
        type: draft.type,
        status: draft.status,
        priority: draft.priority,
        assignee: draft.assignee.trim() || null,
        description: draft.description.trim() || null,
        progressPercent: draft.progressPercent,
        parentId: draft.parentId || null,
        startDate: draft.startDate ? new Date(draft.startDate).getTime() : null,
        dueDate: draft.dueDate ? new Date(draft.dueDate).getTime() : null,
      })
      resetDraft()
      await reload()
      return
    }

    if (!selectedProjectId || !listDomain) return

    const payload = {
      title: trimmed,
      type: draft.type,
      status: draft.status,
      priority: draft.priority,
      assignee: draft.assignee.trim() || undefined,
      description: draft.description.trim() || undefined,
      progressPercent: draft.progressPercent,
      parentId: draft.parentId || undefined,
      startDate: draft.startDate ? new Date(draft.startDate).getTime() : undefined,
      dueDate: draft.dueDate ? new Date(draft.dueDate).getTime() : undefined,
      metadata: buildMetadataPayload(draft, customFields),
    }

    if (editingId) {
      const existing = items.find((item) => item.id === editingId)
      await pmApi.updateWorkItem({
        id: editingId,
        ...payload,
        assignee: draft.assignee.trim() || null,
        description: draft.description.trim() || null,
        parentId: draft.parentId || null,
        startDate: draft.startDate ? new Date(draft.startDate).getTime() : null,
        dueDate: draft.dueDate ? new Date(draft.dueDate).getTime() : null,
        metadata: { ...existing?.metadata, ...payload.metadata },
      })
    } else {
      await pmApi.createWorkItem({
        workspaceId,
        projectId: selectedProjectId,
        domain: listDomain as PmDomain,
        ...payload,
      })
    }

    resetDraft()
    await reload()
  }

  const handleEdit = (item: PmWorkItem) => {
    setEditingId(item.id)
    setDraft(toDraft(item, customFields.map((field) => field.key)))
  }

  const handleToggleStatus = async (item: PmWorkItem) => {
    const nextStatus = item.status === 'done' ? 'todo' : 'done'
    await pmApi.updateWorkItem({ id: item.id, status: nextStatus })
    await reload()
  }

  const handleDelete = async (item: PmWorkItem) => {
    await pmApi.deleteWorkItem(item.id)
    if (editingId === item.id) {
      resetDraft()
    }
    await reload()
  }

  if (loading && projects.length === 0 && items.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.database.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  if (domain !== 'urgent_tasks' && projects.length === 0) {
    return (
      <div className="tm-pm-empty">
        <p>{t('projectManagerPage.database.noProjects')}</p>
      </div>
    )
  }

  return (
    <div className="tm-pm-database">
      {domain !== 'urgent_tasks' ? (
        <div className="tm-pm-database-form">
          <input
            className="tm-pm-database-input"
            value={draft.title}
            placeholder={t('projectManagerPage.database.newItemPlaceholder')}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
          <select
            className="tm-pm-database-select"
            value={draft.type}
            onChange={(event) =>
              setDraft((current) => ({ ...current, type: event.target.value as PmWorkItemType }))
            }>
            {(['task', 'milestone', 'phase', 'issue', 'wbs_node'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`projectManagerPage.database.types.${value}`)}
              </option>
            ))}
          </select>
          <select
            className="tm-pm-database-select"
            value={draft.priority}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                priority: event.target.value as PmWorkItemPriority,
              }))
            }>
            {(['low', 'normal', 'high', 'urgent'] as const).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input
            className="tm-pm-database-input"
            value={draft.assignee}
            placeholder={t('projectManagerPage.database.assigneePlaceholder')}
            onChange={(event) => setDraft((current) => ({ ...current, assignee: event.target.value }))}
          />
          <input
            className="tm-pm-database-input"
            type="date"
            value={draft.startDate}
            onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
          />
          <input
            className="tm-pm-database-input"
            type="date"
            value={draft.dueDate}
            onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
          />
          <select
            className="tm-pm-database-select"
            value={draft.parentId}
            onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value }))}>
            <option value="">{t('projectManagerPage.database.noParent')}</option>
            {parentOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          {customFields.map((field) => (
            <CustomFieldInput
              key={field.key}
              field={field}
              value={draft.metadata[field.key] ?? ''}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  metadata: { ...current.metadata, [field.key]: value },
                }))
              }
            />
          ))}
          <button
            type="button"
            className="tm-pm-database-add"
            disabled={!draft.title.trim() || !selectedProjectId}
            onClick={() => void handleSave()}>
            {editingId ? t('projectManagerPage.database.save') : t('projectManagerPage.database.add')}
          </button>
          {editingId ? (
            <button type="button" className="tm-pm-database-cancel" onClick={resetDraft}>
              {t('projectManagerPage.database.cancel')}
            </button>
          ) : null}
        </div>
      ) : null}

      {treeRows.length === 0 ? (
        <div className="tm-pm-empty">{t('projectManagerPage.database.empty')}</div>
      ) : (
        <table className="tm-pm-database-table">
          <thead>
            <tr>
              <th>{t('projectManagerPage.database.columns.title')}</th>
              <th>{t('projectManagerPage.database.columns.type')}</th>
              <th>{t('projectManagerPage.database.columns.status')}</th>
              <th>{t('projectManagerPage.database.columns.priority')}</th>
              <th>{t('projectManagerPage.database.columns.progress')}</th>
              <th>{t('projectManagerPage.urgent.columns.assignee')}</th>
              <th>{t('projectManagerPage.urgent.columns.due')}</th>
              {customFields.map((field) => (
                <th key={field.key}>{field.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {treeRows.map(({ item, depth }) => (
              <tr key={item.id}>
                <td>
                  <span style={{ paddingLeft: `${depth * 16}px` }}>{item.title}</span>
                </td>
                <td>{item.type}</td>
                <td>{item.status}</td>
                <td>{item.priority}</td>
                <td>{item.progressPercent}%</td>
                <td>{item.assignee ?? '—'}</td>
                <td>
                  {item.dueDate ? new Date(item.dueDate).toLocaleDateString(language) : '—'}
                </td>
                {customFields.map((field) => (
                  <td key={field.key}>{formatMetadataCell(item.metadata[field.key], field.type, language)}</td>
                ))}
                <td className="tm-pm-database-actions">
                  <button type="button" onClick={() => handleEdit(item)}>
                    {t('projectManagerPage.database.edit')}
                  </button>
                  <button type="button" onClick={() => void handleToggleStatus(item)}>
                    {item.status === 'done'
                      ? t('projectManagerPage.database.reopen')
                      : t('projectManagerPage.database.complete')}
                  </button>
                  <button type="button" onClick={() => void handleDelete(item)}>
                    {t('projectManagerPage.database.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function formatMetadataCell(
  value: unknown,
  type: 'text' | 'select' | 'number' | 'date',
  language: string,
): string {
  if (value == null || value === '') return '—'
  if (type === 'date' && typeof value === 'number') {
    return new Date(value).toLocaleDateString(language)
  }
  return String(value)
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: ReturnType<typeof getPmDomainCustomFields>[number]
  value: string
  onChange: (value: string) => void
}) {
  if (field.type === 'select' && field.options) {
    return (
      <select className="tm-pm-database-select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">—</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      className="tm-pm-database-input"
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value}
      placeholder={field.label}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export default ProjectManagementDatabasePanel
