import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { flushSync } from 'react-dom'

import type { PmProject } from '@toolman/shared'
import { buildResourceSaveMetadata, IpcChannel } from '@toolman/shared'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import ProjectInfoDialog from '../schedule/ProjectInfoDialog'
import {
  ProjectResourceMenuBar,
  type ResourceMenuAction,
} from './ProjectResourceMenuBar'
import {
  buildBaselinePriceIndex,
  computeResourceBaselineRatio,
  createEmptyResourceRow,
  fingerprintResourceCatalog,
  formatResourceBaselineRatio,
  isResourceBaselineRatioOff,
  lookupBaselineUnitPrice,
  PM_RESOURCE_APPLICABLE_ALL,
  PM_RESOURCE_CATALOG_KEY,
  readSharedResourceCatalog,
  recordSharedResourceSaveMeta,
  reindexResourceRows,
  resolveProjectResourceCatalog,
  resourceRowDepth,
  upsertSharedResourceCatalog,
  writeSharedResourceCatalog,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog'

interface Props {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
  /** When true, open「全部项目」resource info once (header selected All projects). */
  openWorkspaceInfoRequestId?: number
}

type ContextMenuState = {
  left: number
  top: number
}

function formatPathProjectLabel(project: PmProject): string {
  const code = project.code.trim()
  const name = project.name.trim()
  if (code && name) return `${code} · ${name}`
  return code || name || project.id
}

const ProjectResourceTablePanel: FC<Props> = ({
  workspaceId,
  projects,
  selectedProjectId,
  onProjectsChange,
  openWorkspaceInfoRequestId = 0,
}) => {
  const { t } = useI18n()

  const isAllScope = !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)

  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])

  const viewApplicable = isAllScope
    ? PM_RESOURCE_APPLICABLE_ALL
    : (editingProject?.id ?? PM_RESOURCE_APPLICABLE_ALL)

  const canEdit = isAllScope || editingProject != null

  const [rows, setRows] = useState<PmResourceRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)

  const scopeKey = isAllScope ? PM_RESOURCE_APPLICABLE_ALL : (editingProject?.id ?? '')

  useEffect(() => {
    setDirty(false)
    setSelectedId(null)
    setCheckedIds(new Set())
    setSelectionMode(false)
    setContextMenu(null)
    setProjectInfoOpen(false)
  }, [scopeKey])

  useEffect(() => {
    if (openWorkspaceInfoRequestId <= 0 || !isAllScope) return
    setProjectInfoOpen(true)
  }, [openWorkspaceInfoRequestId, isAllScope])

  useEffect(() => {
    if (dirty) return

    if (isAllScope) {
      const shared = readSharedResourceCatalog(workspaceId)
      setRows(shared.rows)
      if (shared.isDefault) {
        writeSharedResourceCatalog(workspaceId, shared.rows)
      }
      return
    }

    if (!editingProject) {
      setRows([])
      return
    }

    const resolved = resolveProjectResourceCatalog(
      workspaceId,
      editingProject.id,
      editingProject.metadata,
    )
    setRows(resolved.rows)
    if (resolved.needsPersist) {
      void pmApi
        .updateProject({
          id: editingProject.id,
          metadata: { [PM_RESOURCE_CATALOG_KEY]: resolved.rows },
        })
        .then(() => onProjectsChange?.())
        .catch(() => {
          // Keep catalog in memory even if seed write fails.
        })
    }
  }, [dirty, editingProject, isAllScope, onProjectsChange, scopeKey, workspaceId])

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const selectedRow = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedType: PmResourceType = selectedRow?.type ?? 'labor'

  const baselinePriceIndex = useMemo(() => {
    if (isAllScope) return null
    return buildBaselinePriceIndex(readSharedResourceCatalog(workspaceId).rows)
  }, [isAllScope, workspaceId, dirty])

  const updateRows = useCallback((updater: (prev: PmResourceRow[]) => PmResourceRow[]) => {
    setRows((prev) => reindexResourceRows(updater(prev)))
    setDirty(true)
  }, [])

  const persistProjectCatalog = useCallback(
    async (
      project: PmProject,
      catalog: PmResourceRow[],
      options?: { recordSaveVersion?: boolean },
    ) => {
      const metadata: Record<string, unknown> = options?.recordSaveVersion
        ? {
            ...buildResourceSaveMetadata(project.metadata ?? {}, {
              resourceCount: catalog.length,
              contentFingerprint: fingerprintResourceCatalog(catalog),
            }),
            [PM_RESOURCE_CATALOG_KEY]: catalog,
          }
        : { [PM_RESOURCE_CATALOG_KEY]: catalog }
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
    },
    [],
  )

  const propagateSharedToProjects = useCallback(
    async (exceptProjectId?: string | null) => {
      for (const project of projects) {
        if (exceptProjectId && project.id === exceptProjectId) continue
        // Shared catalog is already written; resolve merges any new「全部项目」rows in.
        const resolved = resolveProjectResourceCatalog(
          workspaceId,
          project.id,
          project.metadata,
        )
        if (!resolved.needsPersist) continue
        await persistProjectCatalog(project, resolved.rows)
      }
    },
    [persistProjectCatalog, projects, workspaceId],
  )

  const handleSave = useCallback(async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      if (isAllScope) {
        const payload = rows.map((row) => ({
          ...row,
          applicable: PM_RESOURCE_APPLICABLE_ALL,
        }))
        writeSharedResourceCatalog(workspaceId, payload)
        recordSharedResourceSaveMeta(workspaceId, payload)
        await propagateSharedToProjects()
        setRows(payload)
        setDirty(false)
        await onProjectsChange?.()
        window.alert(t('projectManagerPage.resourceTable.saveSuccess'))
        return
      }
      if (!editingProject) return

      const payload = rows.map((row) => ({
        ...row,
        applicable:
          row.applicable === PM_RESOURCE_APPLICABLE_ALL
            ? PM_RESOURCE_APPLICABLE_ALL
            : editingProject.id,
      }))

      const sharedCandidates = payload.filter(
        (row) => row.applicable === PM_RESOURCE_APPLICABLE_ALL && row.name.trim(),
      )
      if (sharedCandidates.length > 0) {
        const shared = readSharedResourceCatalog(workspaceId)
        const upserted = upsertSharedResourceCatalog(shared.rows, sharedCandidates)
        if (upserted.changed || shared.isDefault) {
          writeSharedResourceCatalog(workspaceId, upserted.rows)
          recordSharedResourceSaveMeta(workspaceId, upserted.rows)
          await propagateSharedToProjects(editingProject.id)
        }
      }

      await persistProjectCatalog(editingProject, payload, { recordSaveVersion: true })
      setRows(payload)
      setDirty(false)
      await onProjectsChange?.()
      window.alert(t('projectManagerPage.resourceTable.saveSuccess'))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    canEdit,
    editingProject,
    isAllScope,
    onProjectsChange,
    persistProjectCatalog,
    propagateSharedToProjects,
    rows,
    t,
    workspaceId,
  ])

  const handlePrint = useCallback(() => {
    flushSync(() => {
      document.title = editingProject
        ? `${formatPathProjectLabel(editingProject)} · ${t('projectManagerPage.resourceTable.printTitle')}`
        : `${t('projectManagerPage.headerProject.allProjects')} · ${t('projectManagerPage.resourceTable.printTitle')}`
    })
    void window.api.invoke(IpcChannel.AppPrintWindow, {
      landscape: false,
      printBackground: true,
    })
  }, [editingProject, t])

  const handleAdd = useCallback(() => {
    if (!canEdit) return
    updateRows((prev) => {
      const next = createEmptyResourceRow(prev.length, selectedType, null, viewApplicable)
      setSelectedId(next.id)
      return [...prev, next]
    })
  }, [canEdit, selectedType, updateRows, viewApplicable])

  const handleInsert = useCallback(() => {
    if (!canEdit || !selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index < 0) return prev
      const parentId = prev[index]?.parentId ?? null
      const next = createEmptyResourceRow(index, selectedType, parentId, viewApplicable)
      setSelectedId(next.id)
      const copy = [...prev]
      copy.splice(index, 0, next)
      return copy
    })
  }, [canEdit, selectedId, selectedType, updateRows, viewApplicable])

  const deleteIds = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return
      updateRows((prev) => {
        const remove = new Set(ids)
        // Also remove descendants whose parent chain is deleted.
        let changed = true
        while (changed) {
          changed = false
          for (const row of prev) {
            if (remove.has(row.id)) continue
            if (row.parentId && remove.has(row.parentId)) {
              remove.add(row.id)
              changed = true
            }
          }
        }
        const next = prev.filter((row) => !remove.has(row.id))
        setSelectedId((current) => (current && remove.has(current) ? null : current))
        setCheckedIds(new Set())
        setSelectionMode(false)
        return next
      })
    },
    [updateRows],
  )

  const handleDelete = useCallback(() => {
    const ids = checkedIds.size > 0 ? checkedIds : selectedId ? new Set([selectedId]) : new Set()
    if (ids.size === 0) return
    setPendingDelete(true)
  }, [checkedIds, selectedId])

  const handleIndent = useCallback(() => {
    if (!selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index <= 0) return prev
      const previous = prev[index - 1]
      if (!previous) return prev
      return prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, parentId: previous.id } : row,
      )
    })
  }, [selectedId, updateRows])

  const handleOutdent = useCallback(() => {
    if (!selectedId) return
    updateRows((prev) => {
      const current = prev.find((row) => row.id === selectedId)
      if (!current?.parentId) return prev
      const parent = prev.find((row) => row.id === current.parentId)
      return prev.map((row) =>
        row.id === selectedId ? { ...row, parentId: parent?.parentId ?? null } : row,
      )
    })
  }, [selectedId, updateRows])

  const handleMove = useCallback(
    (direction: -1 | 1) => {
      if (!selectedId) return
      updateRows((prev) => {
        const index = prev.findIndex((row) => row.id === selectedId)
        const target = index + direction
        if (index < 0 || target < 0 || target >= prev.length) return prev
        const copy = [...prev]
        const [item] = copy.splice(index, 1)
        if (!item) return prev
        copy.splice(target, 0, item)
        return copy
      })
    },
    [selectedId, updateRows],
  )

  const handleTypeChange = useCallback(
    (type: PmResourceType) => {
      if (!selectedId) return
      updateRows((prev) =>
        prev.map((row) => (row.id === selectedId ? { ...row, type } : row)),
      )
    },
    [selectedId, updateRows],
  )

  const handleMenuAction = useCallback(
    (action: ResourceMenuAction) => {
      switch (action) {
        case 'save':
          void handleSave()
          break
        case 'print':
          handlePrint()
          break
        case 'projectInfo':
          setProjectInfoOpen(true)
          break
        case 'add':
          handleAdd()
          break
        case 'insert':
          handleInsert()
          break
        case 'delete':
          handleDelete()
          break
        case 'indent':
          handleIndent()
          break
        case 'outdent':
          handleOutdent()
          break
        case 'moveUp':
          handleMove(-1)
          break
        case 'moveDown':
          handleMove(1)
          break
      }
    },
    [
      handleAdd,
      handleDelete,
      handleIndent,
      handleInsert,
      handleMove,
      handleOutdent,
      handlePrint,
      handleSave,
    ],
  )

  const patchRow = useCallback(
    (id: string, patch: Partial<PmResourceRow>) => {
      updateRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    },
    [updateRows],
  )

  const handleRowContextMenu = useCallback(
    (event: ReactMouseEvent, rowId: string) => {
      event.preventDefault()
      setSelectedId(rowId)
      setSelectionMode(true)
      setCheckedIds((prev) => {
        const next = new Set(prev)
        next.add(rowId)
        return next
      })
      setContextMenu({ left: event.clientX, top: event.clientY })
    },
    [],
  )

  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(rows.map((row) => row.id)))
    setSelectionMode(true)
  }, [rows])

  const handleClearSelection = useCallback(() => {
    setCheckedIds(new Set())
    setSelectionMode(false)
  }, [])

  const pendingDeleteIds =
    checkedIds.size > 0 ? checkedIds : selectedId ? new Set([selectedId]) : new Set<string>()

  return (
    <div className="tm-pm-gantt-page tm-pm-resource-table-page">
      <ProjectResourceMenuBar
        disabled={saving}
        hasSelection={selectedId != null}
        hasProject
        canEdit={canEdit}
        selectedType={selectedType}
        onTypeChange={handleTypeChange}
        onAction={handleMenuAction}
      />

      {!canEdit ? (
        <div className="tm-pm-empty">{t('projectManagerPage.resourceTable.needProject')}</div>
      ) : (
        <div className="tm-pm-resource-table-scroll">
          <div className="tm-pm-resource-table-scroll-inner">
          <table className="tm-pm-resource-table">
            <colgroup>
              <col className="tm-pm-resource-table-col-index" />
              <col className="tm-pm-resource-table-col-type" />
              <col className="tm-pm-resource-table-col-name" />
              <col className="tm-pm-resource-table-col-unit" />
              <col className="tm-pm-resource-table-col-price" />
              <col className="tm-pm-resource-table-col-baseline" />
              <col className="tm-pm-resource-table-col-applicable" />
              <col className="tm-pm-resource-table-col-spacer" />
            </colgroup>
            <thead>
              <tr>
                <th className="tm-pm-resource-table-col-index">
                  {selectionMode ? (
                    <label
                      className="tm-kb-file-card-select"
                      title={t('projectManagerPage.resourceTable.selection.selectAll')}>
                      <input
                        type="checkbox"
                        className="tm-kb-file-card-select-input"
                        checked={rows.length > 0 && checkedIds.size === rows.length}
                        onChange={(event) => {
                          if (event.target.checked) handleSelectAll()
                          else handleClearSelection()
                        }}
                        aria-label={t('projectManagerPage.resourceTable.selection.selectAll')}
                      />
                      <span
                        className={[
                          'tm-kb-file-card-select-box',
                          rows.length > 0 && checkedIds.size === rows.length
                            ? 'tm-kb-file-card-select-box--checked'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-hidden="true"
                      />
                    </label>
                  ) : (
                    t('projectManagerPage.resourceTable.columns.index')
                  )}
                </th>
                <th className="tm-pm-resource-table-col-type">
                  {t('projectManagerPage.resourceTable.columns.type')}
                </th>
                <th className="tm-pm-resource-table-col-name">
                  {t('projectManagerPage.resourceTable.columns.name')}
                </th>
                <th className="tm-pm-resource-table-col-unit">
                  {t('projectManagerPage.resourceTable.columns.unit')}
                </th>
                <th className="tm-pm-resource-table-col-price">
                  {t('projectManagerPage.resourceTable.columns.unitPrice')}
                </th>
                <th className="tm-pm-resource-table-col-baseline">
                  {t('projectManagerPage.resourceTable.columns.baseline')}
                </th>
                <th className="tm-pm-resource-table-col-applicable">
                  {t('projectManagerPage.resourceTable.columns.applicable')}
                </th>
                <th className="tm-pm-resource-table-col-spacer" aria-hidden />
              </tr>
            </thead>            <tbody>
              {rows.map((row, index) => {
                const depth = resourceRowDepth(row, byId)
                const isSelected = selectedId === row.id
                const isChecked = checkedIds.has(row.id)
                return (
                  <tr
                    key={row.id}
                    className={[
                      isSelected ? 'tm-pm-resource-table-row--selected' : '',
                      isChecked ? 'tm-pm-resource-table-row--checked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedId(row.id)}
                    onContextMenu={(event) => handleRowContextMenu(event, row.id)}>
                    <td className="tm-pm-resource-table-index">
                      {selectionMode ? (
                        <label
                          className="tm-kb-file-card-select"
                          title={`${t('projectManagerPage.resourceTable.selection.checkboxColumn')} ${index + 1}`}
                          onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="tm-kb-file-card-select-input"
                            checked={isChecked}
                            aria-label={`${t('projectManagerPage.resourceTable.selection.checkboxColumn')} ${index + 1}`}
                            onChange={(event) => {
                              setCheckedIds((prev) => {
                                const next = new Set(prev)
                                if (event.target.checked) next.add(row.id)
                                else next.delete(row.id)
                                return next
                              })
                            }}
                            onClick={(event) => event.stopPropagation()}
                          />
                          <span
                            className={[
                              'tm-kb-file-card-select-box',
                              isChecked ? 'tm-kb-file-card-select-box--checked' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-hidden="true"
                          />
                        </label>
                      ) : (
                        <span className="tm-pm-resource-table-index-text">{index + 1}</span>
                      )}
                    </td>
                    <td>
                      <select
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={row.type}
                        onChange={(event) =>
                          patchRow(row.id, {
                            type: event.target.value as PmResourceType,
                          })
                        }
                        onClick={(event) => event.stopPropagation()}>
                        {(
                          [
                            'labor',
                            'material',
                            'equipment',
                            'management',
                            'fees',
                            'other',
                          ] as const
                        ).map((type) => (
                          <option key={type} value={type}>
                            {t(`projectManagerPage.resourceTable.types.${type}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="tm-pm-resource-table-input"
                        style={{ paddingLeft: `${8 + depth * 16}px` }}
                        value={row.name}
                        placeholder={t('projectManagerPage.resourceTable.namePlaceholder')}
                        onChange={(event) => patchRow(row.id, { name: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td className="tm-pm-resource-table-cell--center">
                      <input
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={row.unit}
                        onChange={(event) => patchRow(row.id, { unit: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td className="tm-pm-resource-table-cell--center">
                      <input
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                        type="number"
                        min={0}
                        step="any"
                        value={row.unitPrice ?? ''}
                        onChange={(event) => {
                          const raw = event.target.value.trim()
                          patchRow(row.id, {
                            unitPrice: raw === '' ? null : Number(raw),
                          })
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-baseline">
                      {(() => {
                        const ratio = isAllScope
                          ? 1
                          : computeResourceBaselineRatio(
                              row.unitPrice,
                              baselinePriceIndex
                                ? lookupBaselineUnitPrice(row, baselinePriceIndex)
                                : null,
                            )
                        const label = ratio == null ? '—' : formatResourceBaselineRatio(ratio)
                        const off = !isAllScope && isResourceBaselineRatioOff(ratio)
                        return (
                          <span
                            className={[
                              'tm-pm-resource-table-baseline-text',
                              off ? 'tm-pm-resource-table-baseline-text--off' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            title={
                              ratio == null
                                ? undefined
                                : t('projectManagerPage.resourceTable.baselineHint', {
                                    ratio: label,
                                  })
                            }>
                            {label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-applicable">
                      {isAllScope ? (
                        <span
                          className="tm-pm-resource-table-applicable-text"
                          title={t('projectManagerPage.resourceTable.applicableAll')}>
                          {t('projectManagerPage.resourceTable.applicableAll')}
                        </span>
                      ) : (
                        (() => {
                          const applicableValue =
                            row.applicable === PM_RESOURCE_APPLICABLE_ALL
                              ? PM_RESOURCE_APPLICABLE_ALL
                              : (editingProject?.id ?? viewApplicable)
                          const applicableLabel =
                            applicableValue === PM_RESOURCE_APPLICABLE_ALL
                              ? t('projectManagerPage.resourceTable.applicableAll')
                              : editingProject
                                ? formatPathProjectLabel(editingProject)
                                : applicableValue
                          return (
                            <div className="tm-pm-resource-table-applicable-control">
                              <span
                                className="tm-pm-resource-table-applicable-display"
                                title={applicableLabel}>
                                {applicableLabel}
                              </span>
                              <select
                                className="tm-pm-resource-table-applicable-select"
                                value={applicableValue}
                                aria-label={t(
                                  'projectManagerPage.resourceTable.columns.applicable',
                                )}
                                title={
                                  applicableLabel ||
                                  t('projectManagerPage.resourceTable.applicableHint')
                                }
                                onChange={(event) =>
                                  patchRow(row.id, { applicable: event.target.value })
                                }
                                onClick={(event) => event.stopPropagation()}>
                                <option value={PM_RESOURCE_APPLICABLE_ALL}>
                                  {t('projectManagerPage.resourceTable.applicableAll')}
                                </option>
                                {editingProject ? (
                                  <option value={editingProject.id}>
                                    {formatPathProjectLabel(editingProject)}
                                  </option>
                                ) : null}
                              </select>
                            </div>
                          )
                        })()
                      )}
                    </td>
                    <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <footer className="tm-pm-gantt-statusbar" aria-live="polite">
        <div
          className={[
            'tm-pm-gantt-statusbar-message',
            dirty
              ? 'tm-pm-gantt-statusbar-message--info'
              : 'tm-pm-gantt-statusbar-message--muted',
          ].join(' ')}>
          {dirty
            ? t('projectManagerPage.resourceTable.statusDirty', {
                count: String(rows.length),
              })
            : t('projectManagerPage.resourceTable.statusReady', {
                count: String(rows.length),
              })}
          {selectedRow?.name
            ? ` · ${t('projectManagerPage.resourceTable.statusSelected', {
                name: selectedRow.name,
              })}`
            : null}
        </div>
      </footer>

      {contextMenu
        ? createPortal(
            <>
              <button
                type="button"
                className="tm-group-context-menu-backdrop"
                aria-label={t('projectManagerPage.resourceTable.selection.cancel')}
                onClick={() => setContextMenu(null)}
              />
              <div
                className="tm-group-context-menu"
                style={{ left: contextMenu.left, top: contextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleSelectAll()
                    setContextMenu(null)
                  }}>
                  {t('projectManagerPage.resourceTable.selection.selectAll')}
                </button>
                <button
                  type="button"
                  className={[
                    'tm-group-context-menu-item',
                    'tm-group-context-menu-item--danger',
                    checkedIds.size === 0 ? 'tm-group-context-menu-item--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="menuitem"
                  disabled={checkedIds.size === 0}
                  onClick={() => {
                    if (checkedIds.size === 0) return
                    setContextMenu(null)
                    setPendingDelete(true)
                  }}>
                  {t('projectManagerPage.resourceTable.selection.deleteSelected')}
                  {checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleClearSelection()
                    setContextMenu(null)
                  }}>
                  {t('projectManagerPage.resourceTable.selection.cancel')}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('projectManagerPage.resourceTable.selection.deleteSelectedTitle')}
          message={t('projectManagerPage.resourceTable.selection.deleteSelectedConfirm', {
            count: String(pendingDeleteIds.size),
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDelete(false)}
          onConfirm={() => {
            deleteIds(pendingDeleteIds)
            setPendingDelete(false)
          }}
        />
      ) : null}

      {projectInfoOpen && editingProject ? (
        <ProjectInfoDialog
          project={editingProject}
          variant="resource"
          resourceRows={rows}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}

      {projectInfoOpen && isAllScope ? (
        <ProjectInfoDialog
          mode="workspaceResource"
          workspaceId={workspaceId}
          resourceRows={rows}
          onSaveResources={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}
    </div>
  )
}

export default ProjectResourceTablePanel
