import { useCallback, useEffect, useMemo, useState } from 'react'

import type { PmDomain, PmProject, PmTimeEntry, PmWorkItem } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'

export function useProjectTimeEntryPanel(
  workspaceId: string,
  listDomain: PmDomain = 'cost_management',
) {
  const { t, language } = useI18n()
  const [projects, setProjects] = useState<PmProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [workItems, setWorkItems] = useState<PmWorkItem[]>([])
  const [entries, setEntries] = useState<PmTimeEntry[]>([])
  const [hours, setHours] = useState('8')
  const [assignee, setAssignee] = useState('')
  const [description, setDescription] = useState('')
  const [workItemId, setWorkItemId] = useState('')
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editHours, setEditHours] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editWorkDate, setEditWorkDate] = useState('')
  const [editWorkItemId, setEditWorkItemId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const workItemTitleById = useMemo(
    () => new Map(workItems.map((item) => [item.id, item.title])),
    [workItems],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const projectResult = await pmApi.listProjects(workspaceId, listDomain)
      setProjects(projectResult.projects)
      const projectId = selectedProjectId ?? projectResult.projects[0]?.id ?? null
      setSelectedProjectId(projectId)
      if (!projectId) {
        setEntries([])
        setWorkItems([])
        return
      }
      const [entryResult, itemResult] = await Promise.all([
        pmApi.listTimeEntries(workspaceId, projectId),
        pmApi.listWorkItems({
          workspaceId,
          projectId,
          domain: listDomain,
          limit: 1000,
        }),
      ])
      setEntries(entryResult.entries)
      setWorkItems(itemResult.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [listDomain, selectedProjectId, workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleCreate = async () => {
    if (!selectedProjectId) return
    const spentHours = Number.parseFloat(hours)
    if (!Number.isFinite(spentHours) || spentHours <= 0) return
    await pmApi.createTimeEntry({
      workspaceId,
      projectId: selectedProjectId,
      workItemId: workItemId || undefined,
      assignee: assignee.trim() || undefined,
      spentHours,
      workDate: new Date(workDate).getTime(),
      description: description.trim() || undefined,
    })
    setDescription('')
    setWorkItemId('')
    await reload()
  }

  const startEdit = (entry: PmTimeEntry) => {
    setEditingId(entry.id)
    setEditHours(`${entry.spentHours}`)
    setEditAssignee(entry.assignee ?? '')
    setEditDescription(entry.description ?? '')
    setEditWorkDate(new Date(entry.workDate).toISOString().slice(0, 10))
    setEditWorkItemId(entry.workItemId ?? '')
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const spentHours = Number.parseFloat(editHours)
    if (!Number.isFinite(spentHours) || spentHours <= 0) return
    await pmApi.updateTimeEntry({
      id: editingId,
      workItemId: editWorkItemId || null,
      assignee: editAssignee.trim() || null,
      spentHours,
      workDate: new Date(editWorkDate).getTime(),
      description: editDescription.trim() || null,
    })
    setEditingId(null)
    await reload()
  }

  return {
    t,
    language,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    workItems,
    entries,
    hours,
    setHours,
    assignee,
    setAssignee,
    description,
    setDescription,
    workItemId,
    setWorkItemId,
    workDate,
    setWorkDate,
    editingId,
    setEditingId,
    editHours,
    setEditHours,
    editAssignee,
    setEditAssignee,
    editDescription,
    setEditDescription,
    editWorkDate,
    setEditWorkDate,
    editWorkItemId,
    setEditWorkItemId,
    loading,
    error,
    workItemTitleById,
    reload,
    handleCreate,
    startEdit,
    handleSaveEdit,
  }
}
