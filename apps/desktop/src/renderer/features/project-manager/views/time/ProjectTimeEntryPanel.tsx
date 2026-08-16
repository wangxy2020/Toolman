import type { FC } from 'react'

import type { PmDomain } from '@toolman/shared'

import { pmApi } from '../../pm-api'
import { useProjectTimeEntryPanel } from './useProjectTimeEntryPanel'

interface Props {
  workspaceId: string
  listDomain?: PmDomain
}

const ProjectTimeEntryPanel: FC<Props> = ({ workspaceId, listDomain = 'cost_management' }) => {
  const {
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
  } = useProjectTimeEntryPanel(workspaceId, listDomain)

  if (loading) {
    return <div className="tm-pm-empty">{t('projectManagerPage.timeEntries.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  return (
    <div className="tm-pm-time-entries">
      <h3>{t('projectManagerPage.timeEntries.title')}</h3>
      <div className="tm-pm-database-toolbar">
        <label className="tm-pm-database-label">
          {t('projectManagerPage.database.project')}
          <select
            className="tm-pm-database-select"
            value={selectedProjectId ?? ''}
            onChange={(event) => setSelectedProjectId(event.target.value || null)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tm-pm-database-form">
        <input
          className="tm-pm-database-input"
          type="number"
          min="0.5"
          step="0.5"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          placeholder={t('projectManagerPage.timeEntries.hours')}
        />
        <input
          className="tm-pm-database-input"
          type="date"
          value={workDate}
          onChange={(event) => setWorkDate(event.target.value)}
        />
        <select
          className="tm-pm-database-select"
          value={workItemId}
          onChange={(event) => setWorkItemId(event.target.value)}>
          <option value="">{t('projectManagerPage.timeEntries.noWorkItem')}</option>
          {workItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <input
          className="tm-pm-database-input"
          value={assignee}
          placeholder={t('projectManagerPage.database.assigneePlaceholder')}
          onChange={(event) => setAssignee(event.target.value)}
        />
        <input
          className="tm-pm-database-input"
          value={description}
          placeholder={t('projectManagerPage.timeEntries.description')}
          onChange={(event) => setDescription(event.target.value)}
        />
        <button type="button" className="tm-pm-database-add" onClick={() => void handleCreate()}>
          {t('projectManagerPage.timeEntries.add')}
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="tm-pm-empty">{t('projectManagerPage.timeEntries.empty')}</div>
      ) : (
        <table className="tm-pm-database-table">
          <thead>
            <tr>
              <th>{t('projectManagerPage.timeEntries.columns.date')}</th>
              <th>{t('projectManagerPage.timeEntries.columns.hours')}</th>
              <th>{t('projectManagerPage.timeEntries.columns.workItem')}</th>
              <th>{t('projectManagerPage.urgent.columns.assignee')}</th>
              <th>{t('projectManagerPage.timeEntries.columns.description')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isEditing = editingId === entry.id
              return (
                <tr key={entry.id}>
                  <td>
                    {isEditing ? (
                      <input
                        className="tm-pm-database-input"
                        type="date"
                        value={editWorkDate}
                        onChange={(event) => setEditWorkDate(event.target.value)}
                      />
                    ) : (
                      new Date(entry.workDate).toLocaleDateString(language)
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="tm-pm-database-input"
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={editHours}
                        onChange={(event) => setEditHours(event.target.value)}
                      />
                    ) : (
                      entry.spentHours
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select
                        className="tm-pm-database-select"
                        value={editWorkItemId}
                        onChange={(event) => setEditWorkItemId(event.target.value)}>
                        <option value="">{t('projectManagerPage.timeEntries.noWorkItem')}</option>
                        {workItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (entry.workItemId && workItemTitleById.get(entry.workItemId)) || '—'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="tm-pm-database-input"
                        value={editAssignee}
                        onChange={(event) => setEditAssignee(event.target.value)}
                      />
                    ) : (
                      entry.assignee ?? '—'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="tm-pm-database-input"
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                      />
                    ) : (
                      entry.description ?? '—'
                    )}
                  </td>
                  <td className="tm-pm-database-actions">
                    {isEditing ? (
                      <>
                        <button type="button" onClick={() => void handleSaveEdit()}>
                          {t('projectManagerPage.database.save')}
                        </button>
                        <button type="button" onClick={() => setEditingId(null)}>
                          {t('projectManagerPage.database.cancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(entry)}>
                          {t('projectManagerPage.database.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void pmApi.deleteTimeEntry(entry.id).then(reload)}>
                          {t('projectManagerPage.database.delete')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default ProjectTimeEntryPanel
