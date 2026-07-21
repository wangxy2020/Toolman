import type { FC, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { flushSync } from 'react-dom'

import type { PmProject, PmWorkItem, Workspace } from '@toolman/shared'
import { IpcChannel } from '@toolman/shared'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import type { SystemPaths } from '../../../chat/useSystemPaths'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import ProjectInfoDialog from '../schedule/ProjectInfoDialog'
import { formatWorkItemDate } from '../schedule/pm-gantt-utils'
import {
  loadGanttUiPrefs,
  saveGanttUiPrefs,
  type GanttScheduleView,
} from '../schedule/pm-gantt-prefs'
import {
  ProjectFeaturesMenuBar,
  type FeaturesMenuAction,
  type FeaturesScheduleView,
} from './ProjectFeaturesMenuBar'
import {
  buildLiveScheduleFeatureRows,
  buildResourceUnitLookup,
  collectGanttFeatureSeeds,
  collectRollupMonthKeys,
  computeFeatureGanttRollups,
  formatRollupMonthQuantity,
  formatRollupQuantity,
  groupMonthKeysByYear,
  parseMonthKey,
  usesPeakConcurrentRollup,
} from './pm-feature-gantt-rollup'
import {
  createEmptyFeatureRow,
  featureRowDepth,
  isPmFeatureType,
  PM_FEATURE_APPLICABLE_ALL,
  PM_FEATURE_CATALOG_KEY,
  PM_FEATURE_TYPES,
  readSharedFeatureCatalog,
  reindexFeatureRows,
  resolveProjectFeatureCatalog,
  stripScheduleFeatureRows,
  upsertSharedFeatureCatalog,
  writeSharedFeatureCatalog,
  type PmFeatureRow,
  type PmFeatureType,
} from './pm-features-catalog'
import { resolveAssignableResourceCatalog } from '../resource/pm-resource-catalog'

interface Props {
  workspaceId: string
  workspace: Workspace | null
  systemPaths: SystemPaths | null
  projects: PmProject[]
  selectedProjectId: string | null
  /** Switch to the Gantt panel with the chosen schedule sub-view. */
  onOpenScheduleView?: (view: FeaturesScheduleView) => void
  onProjectsChange?: () => void
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

/**
 * Practice (实务) view — table chrome aligned with Resource list
 * (`tm-pm-resource-table-*` + Gantt page shell / Features menubar).
 */
const ProjectManagementFilesPanel: FC<Props> = ({
  workspaceId,
  projects,
  selectedProjectId,
  onOpenScheduleView,
  onProjectsChange,
}) => {
  const { t } = useI18n()
  const [scheduleView, setScheduleView] = useState<FeaturesScheduleView>(() => {
    const prefs = loadGanttUiPrefs()
    return prefs.scheduleView
  })

  const isAllScope =
    !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)

  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])

  const viewApplicable = isAllScope
    ? PM_FEATURE_APPLICABLE_ALL
    : (editingProject?.id ?? PM_FEATURE_APPLICABLE_ALL)

  const canEdit = isAllScope || editingProject != null

  const [rows, setRows] = useState<PmFeatureRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [, setDraftType] = useState<PmFeatureType>('labor')
  /** Menu filter: 人力 / 材料 / … only show rows of this type. */
  const [viewType, setViewType] = useState<PmFeatureType>('labor')
  /** horizontal = resources as rows; vertical = months as rows. */
  const [matrixLayout, setMatrixLayout] = useState<'horizontal' | 'vertical'>('horizontal')
  const [workItems, setWorkItems] = useState<PmWorkItem[]>([])

  const scopeKey = isAllScope ? PM_FEATURE_APPLICABLE_ALL : (editingProject?.id ?? '')

  useEffect(() => {
    setDirty(false)
    setSelectedId(null)
    setCheckedIds(new Set())
    setSelectionMode(false)
    setContextMenu(null)
    setProjectInfoOpen(false)
    setMatrixLayout('horizontal')
  }, [scopeKey])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (isAllScope) {
          const batches = await Promise.all(
            projects.map((project) =>
              pmApi.listWorkItems({
                workspaceId,
                projectId: project.id,
                domain: 'progress_management',
                limit: 1000,
              }),
            ),
          )
          if (cancelled) return
          setWorkItems(batches.flatMap((batch) => batch.items))
          return
        }
        if (!editingProject) {
          if (!cancelled) setWorkItems([])
          return
        }
        const result = await pmApi.listWorkItems({
          workspaceId,
          projectId: editingProject.id,
          domain: 'progress_management',
          limit: 1000,
        })
        if (!cancelled) setWorkItems(result.items)
      } catch {
        if (!cancelled) setWorkItems([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editingProject, isAllScope, projects, scopeKey, workspaceId])

  const assignableResourceCatalog = useMemo(() => {
    if (isAllScope) {
      return projects.flatMap((project) =>
        resolveAssignableResourceCatalog(workspaceId, project.id, project.metadata),
      )
    }
    if (!editingProject) return []
    return resolveAssignableResourceCatalog(
      workspaceId,
      editingProject.id,
      editingProject.metadata,
    )
  }, [editingProject, isAllScope, projects, workspaceId])

  const unitLookup = useMemo(
    () => buildResourceUnitLookup(assignableResourceCatalog),
    [assignableResourceCatalog],
  )

  const ganttSeeds = useMemo(
    () => collectGanttFeatureSeeds(workItems, unitLookup, assignableResourceCatalog),
    [assignableResourceCatalog, unitLookup, workItems],
  )

  useEffect(() => {
    if (dirty) return

    if (isAllScope) {
      const shared = readSharedFeatureCatalog(workspaceId)
      const stripped = stripScheduleFeatureRows(shared.rows)
      if (shared.isDefault || stripped.changed) {
        writeSharedFeatureCatalog(workspaceId, stripped.rows)
      }
      setRows(
        reindexFeatureRows([
          ...buildLiveScheduleFeatureRows(ganttSeeds, [], PM_FEATURE_APPLICABLE_ALL),
          ...stripped.rows,
        ]),
      )
      return
    }

    if (!editingProject) {
      setRows([])
      return
    }

    const resolved = resolveProjectFeatureCatalog(
      workspaceId,
      editingProject.id,
      editingProject.metadata,
    )
    const stripped = stripScheduleFeatureRows(resolved.rows)
    setRows(
      reindexFeatureRows([
        ...buildLiveScheduleFeatureRows(ganttSeeds, [], PM_FEATURE_APPLICABLE_ALL),
        ...stripped.rows,
      ]),
    )
    if (resolved.needsPersist || stripped.changed) {
      void pmApi
        .updateProject({
          id: editingProject.id,
          metadata: { [PM_FEATURE_CATALOG_KEY]: stripped.rows },
        })
        .then(() => onProjectsChange?.())
        .catch(() => {
          // Keep catalog in memory even if seed write fails.
        })
    }
  }, [
    dirty,
    editingProject,
    ganttSeeds,
    isAllScope,
    onProjectsChange,
    scopeKey,
    workspaceId,
  ])

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const visibleRows = useMemo(
    () => rows.filter((row) => row.type === viewType),
    [rows, viewType],
  )
  const selectedRow = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedType: PmFeatureType = viewType
  const quantityFromGanttHint = usesPeakConcurrentRollup(viewType)
    ? t('projectManagerPage.files.table.quantityFromGanttHintPeak')
    : t('projectManagerPage.files.table.quantityFromGanttHint')
  const monthFromGanttHint = usesPeakConcurrentRollup(viewType)
    ? t('projectManagerPage.files.table.monthFromGanttHintPeak')
    : t('projectManagerPage.files.table.monthFromGanttHint')

  const rollups = useMemo(
    () => computeFeatureGanttRollups(workItems, rows),
    [rows, workItems],
  )
  const monthKeys = useMemo(() => {
    const scoped = new Map(
      visibleRows.map((row) => {
        const rollup = rollups.get(row.id)
        return [
          row.id,
          rollup ?? { quantity: 0, startDate: null, finishDate: null, monthly: {} },
        ] as const
      }),
    )
    return collectRollupMonthKeys(scoped)
  }, [rollups, visibleRows])
  const yearBands = useMemo(() => groupMonthKeysByYear(monthKeys), [monthKeys])

  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const hTrackRef = useRef<HTMLDivElement | null>(null)
  const [hScrollMetrics, setHScrollMetrics] = useState({
    overflowing: false,
    thumbSize: 0,
    thumbOffset: 0,
  })
  const [hScrollDragging, setHScrollDragging] = useState(false)

  const syncHScrollMetrics = useCallback(() => {
    const el = tableScrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    if (scrollWidth <= clientWidth + 1) {
      setHScrollMetrics({ overflowing: false, thumbSize: 0, thumbOffset: 0 })
      return
    }
    const thumbSize = Math.max(28, (clientWidth / scrollWidth) * clientWidth)
    const maxOffset = Math.max(0, clientWidth - thumbSize)
    const maxScroll = scrollWidth - clientWidth
    const thumbOffset = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * maxOffset
    setHScrollMetrics({ overflowing: true, thumbSize, thumbOffset })
  }, [])

  useLayoutEffect(() => {
    syncHScrollMetrics()
    const el = tableScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => syncHScrollMetrics())
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    window.addEventListener('resize', syncHScrollMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHScrollMetrics)
    }
  }, [matrixLayout, monthKeys.length, syncHScrollMetrics, visibleRows.length])

  const scrollToThumbOffset = useCallback((nextOffsetRatio: number) => {
    const el = tableScrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const travel = 1 - thumbSize
    const clamped = Math.max(0, Math.min(travel, nextOffsetRatio))
    el.scrollLeft = travel <= 0 ? 0 : (clamped / travel) * maxScroll
  }, [])

  const onHTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const track = hTrackRef.current
      const el = tableScrollRef.current
      if (!track || !el) return
      event.preventDefault()
      setHScrollDragging(true)
      const trackRect = track.getBoundingClientRect()
      const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
      const pointerRatio = (event.clientX - trackRect.left) / trackRect.width
      scrollToThumbOffset(pointerRatio - thumbSize / 2)

      const onMove = (moveEvent: PointerEvent) => {
        const ratio = (moveEvent.clientX - trackRect.left) / trackRect.width
        scrollToThumbOffset(ratio - thumbSize / 2)
        syncHScrollMetrics()
      }
      const onUp = () => {
        setHScrollDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [scrollToThumbOffset, syncHScrollMetrics],
  )

  const updateRows = useCallback((updater: (prev: PmFeatureRow[]) => PmFeatureRow[]) => {
    setRows((prev) => reindexFeatureRows(updater(prev)))
    setDirty(true)
  }, [])

  const persistProjectCatalog = useCallback(async (project: PmProject, catalog: PmFeatureRow[]) => {
    await pmApi.updateProject({
      id: project.id,
      metadata: { [PM_FEATURE_CATALOG_KEY]: catalog },
    })
  }, [])

  const propagateSharedToProjects = useCallback(
    async (exceptProjectId?: string | null) => {
      for (const project of projects) {
        if (exceptProjectId && project.id === exceptProjectId) continue
        const resolved = resolveProjectFeatureCatalog(
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
      // labor / auxiliary / material / machinery are live from Gantt — never persist them.
      const persisted = stripScheduleFeatureRows(rows).rows
      const live = buildLiveScheduleFeatureRows(ganttSeeds, [], viewApplicable)

      if (isAllScope) {
        const payload = persisted.map((row) => ({
          ...row,
          applicable: PM_FEATURE_APPLICABLE_ALL,
        }))
        writeSharedFeatureCatalog(workspaceId, payload)
        await propagateSharedToProjects()
        setRows(reindexFeatureRows([...live, ...payload]))
        setDirty(false)
        await onProjectsChange?.()
        window.alert(t('projectManagerPage.files.table.saveSuccess'))
        return
      }
      if (!editingProject) return

      const payload = persisted.map((row) => ({
        ...row,
        applicable:
          row.applicable === PM_FEATURE_APPLICABLE_ALL
            ? PM_FEATURE_APPLICABLE_ALL
            : editingProject.id,
      }))

      const sharedCandidates = payload.filter(
        (row) => row.applicable === PM_FEATURE_APPLICABLE_ALL && row.name.trim(),
      )
      if (sharedCandidates.length > 0) {
        const shared = readSharedFeatureCatalog(workspaceId)
        const upserted = upsertSharedFeatureCatalog(shared.rows, sharedCandidates)
        if (upserted.changed || shared.isDefault) {
          writeSharedFeatureCatalog(workspaceId, upserted.rows)
          await propagateSharedToProjects(editingProject.id)
        }
      }

      await persistProjectCatalog(editingProject, payload)
      setRows(reindexFeatureRows([...live, ...payload]))
      setDirty(false)
      await onProjectsChange?.()
      window.alert(t('projectManagerPage.files.table.saveSuccess'))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    canEdit,
    editingProject,
    ganttSeeds,
    isAllScope,
    onProjectsChange,
    persistProjectCatalog,
    propagateSharedToProjects,
    rows,
    t,
    viewApplicable,
    workspaceId,
  ])

  const handlePrint = useCallback(() => {
    flushSync(() => {
      document.title = editingProject
        ? `${formatPathProjectLabel(editingProject)} · ${t('projectManagerPage.files.table.printTitle')}`
        : `${t('projectManagerPage.headerProject.allProjects')} · ${t('projectManagerPage.files.table.printTitle')}`
    })
    void window.api.invoke(IpcChannel.AppPrintWindow, {
      landscape: false,
      printBackground: true,
    })
  }, [editingProject, t])

  const handleAdd = useCallback(() => {
    if (!canEdit) return
    updateRows((prev) => {
      const next = createEmptyFeatureRow(prev.length, selectedType, null, viewApplicable)
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
      const next = createEmptyFeatureRow(index, selectedType, parentId, viewApplicable)
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

  const handleTypeChange = useCallback((type: PmFeatureType) => {
    setDraftType(type)
    setViewType(type)
  }, [])

  const handleScheduleViewChange = useCallback(
    (view: FeaturesScheduleView) => {
      setScheduleView(view)
      const prefs = loadGanttUiPrefs()
      saveGanttUiPrefs({ ...prefs, scheduleView: view as GanttScheduleView })
      onOpenScheduleView?.(view)
    },
    [onOpenScheduleView],
  )

  const handleMenuAction = useCallback(
    (action: FeaturesMenuAction) => {
      if (isPmFeatureType(action)) {
        handleTypeChange(action)
        return
      }
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
        case 'undo':
        case 'redo':
          break
        default:
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
      handleTypeChange,
    ],
  )

  const patchRow = useCallback(
    (id: string, patch: Partial<PmFeatureRow>) => {
      updateRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    },
    [updateRows],
  )

  const handleRowContextMenu = useCallback(
    (event: ReactMouseEvent, _rowId: string) => {
      event.preventDefault()
      event.stopPropagation()
      setSelectionMode(true)
      setContextMenu({ left: event.clientX, top: event.clientY })
    },
    [],
  )

  const handleTableContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    setSelectionMode(true)
    setContextMenu({ left: event.clientX, top: event.clientY })
  }, [])

  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(visibleRows.map((row) => row.id)))
    setSelectionMode(true)
  }, [visibleRows])

  const handleClearSelection = useCallback(() => {
    setCheckedIds(new Set())
    setSelectionMode(false)
  }, [])

  const pendingDeleteIds =
    checkedIds.size > 0 ? checkedIds : selectedId ? new Set([selectedId]) : new Set<string>()

  return (
    <div className="tm-pm-gantt-page tm-pm-features-page tm-pm-features-table-page">
      <ProjectFeaturesMenuBar
        disabled={saving}
        hasSelection={selectedId != null}
        hasProject={editingProject != null}
        canEdit={canEdit}
        selectedType={selectedType}
        scheduleView={scheduleView}
        onScheduleViewChange={handleScheduleViewChange}
        onAction={handleMenuAction}
      />

      {!canEdit ? (
        <div className="tm-pm-empty">{t('projectManagerPage.files.table.needProject')}</div>
      ) : (
        <div
          className={[
            'tm-pm-features-table-scroll-wrap',
            hScrollMetrics.overflowing ? 'tm-pm-features-table-scroll-wrap--h-overflow' : '',
            hScrollDragging ? 'tm-pm-features-table-scroll-wrap--h-dragging' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div
            ref={tableScrollRef}
            className="tm-pm-resource-table-scroll"
            onScroll={() => syncHScrollMetrics()}
          >
            <div
              className="tm-pm-resource-table-scroll-inner"
              onContextMenu={handleTableContextMenu}
            >
              {matrixLayout === 'vertical' ? (
              <table
                className="tm-pm-resource-table tm-pm-features-table--vertical"
                onContextMenu={handleTableContextMenu}
              >
                <colgroup>
                  <col className="tm-pm-resource-table-col-index" />
                  <col className="tm-pm-features-table-col-date" />
                  <col className="tm-pm-features-table-col-month" />
                  {visibleRows.map((row) => (
                    <col key={row.id} className="tm-pm-features-table-col-resource" />
                  ))}
                  <col className="tm-pm-resource-table-col-spacer" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="tm-pm-resource-table-col-index">
                      {t('projectManagerPage.files.table.columns.index')}
                    </th>
                    <th className="tm-pm-features-table-col-date">
                      {t('projectManagerPage.files.table.columns.yearColumn')}
                    </th>
                    <th className="tm-pm-features-table-col-month">
                      {t('projectManagerPage.files.table.columns.monthColumn')}
                    </th>
                    {visibleRows.map((row) => (
                      <th
                        key={row.id}
                        className="tm-pm-features-table-col-resource"
                        title={row.name.trim() || undefined}
                      >
                        <span className="tm-pm-features-table-resource-label">
                          {row.name.trim() || '—'}
                        </span>
                      </th>
                    ))}
                    <th className="tm-pm-resource-table-col-spacer" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    if (yearBands.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={3 + visibleRows.length + 1}
                            className="tm-pm-resource-table-cell--center"
                          >
                            —
                          </td>
                        </tr>
                      )
                    }
                    let rowNumber = 0
                    return yearBands.flatMap((band) =>
                      band.monthKeys.map((monthKey, monthIndex) => {
                        rowNumber += 1
                        const parsed = parseMonthKey(monthKey)
                        const currentNo = rowNumber
                        return (
                          <tr key={monthKey}>
                            <td className="tm-pm-resource-table-index">
                              <span className="tm-pm-resource-table-index-text">{currentNo}</span>
                            </td>
                            {monthIndex === 0 ? (
                              <td
                                className="tm-pm-resource-table-cell--center tm-pm-features-table-year"
                                rowSpan={band.monthKeys.length}
                              >
                                {t('projectManagerPage.files.table.columns.monthYear', {
                                  year: String(band.year),
                                })}
                              </td>
                            ) : null}
                            <td className="tm-pm-resource-table-cell--center tm-pm-features-table-month">
                              {parsed
                                ? t('projectManagerPage.files.table.columns.monthPart', {
                                    month: String(parsed.monthIndex + 1),
                                  })
                                : monthKey}
                            </td>
                            {visibleRows.map((row) => {
                              const rollup = rollups.get(row.id)
                              return (
                                <td
                                  key={row.id}
                                  className="tm-pm-resource-table-cell--center tm-pm-features-table-month"
                                >
                                  <span
                                    className="tm-pm-features-table-rollup"
                                    title={monthFromGanttHint}
                                  >
                                    {formatRollupMonthQuantity(rollup?.monthly[monthKey])}
                                  </span>
                                </td>
                              )
                            })}
                            <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                          </tr>
                        )
                      }),
                    )
                  })()}
                </tbody>
              </table>
              ) : (
            <table className="tm-pm-resource-table">
              <colgroup>
                <col className="tm-pm-resource-table-col-index" />
                <col className="tm-pm-resource-table-col-type" />
                <col className="tm-pm-resource-table-col-name" />
                <col className="tm-pm-resource-table-col-unit" />
                <col className="tm-pm-resource-table-col-price" />
                <col className="tm-pm-features-table-col-date" />
                <col className="tm-pm-features-table-col-date" />
                {monthKeys.map((monthKey) => (
                  <col key={monthKey} className="tm-pm-features-table-col-month" />
                ))}
                <col className="tm-pm-features-table-col-remark" />
                <col className="tm-pm-resource-table-col-spacer" />
              </colgroup>
              <thead>
                  <tr className="tm-pm-features-table-head-row tm-pm-features-table-head-row--year">
                    <th rowSpan={monthKeys.length > 0 ? 2 : 1} className="tm-pm-resource-table-col-index">
                      {selectionMode ? (
                        <label
                          className="tm-kb-file-card-select"
                          title={t('projectManagerPage.files.table.selection.selectAll')}
                        >
                          <input
                            type="checkbox"
                            className="tm-kb-file-card-select-input"
                            checked={
                              visibleRows.length > 0 &&
                              visibleRows.every((row) => checkedIds.has(row.id))
                            }
                            onChange={(event) => {
                              if (event.target.checked) handleSelectAll()
                              else handleClearSelection()
                            }}
                            aria-label={t('projectManagerPage.files.table.selection.selectAll')}
                          />
                          <span
                            className={[
                              'tm-kb-file-card-select-box',
                              visibleRows.length > 0 &&
                              visibleRows.every((row) => checkedIds.has(row.id))
                                ? 'tm-kb-file-card-select-box--checked'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-hidden="true"
                          />
                        </label>
                      ) : (
                        t('projectManagerPage.files.table.columns.index')
                      )}
                    </th>
                    <th rowSpan={monthKeys.length > 0 ? 2 : 1} className="tm-pm-resource-table-col-type">
                      {t('projectManagerPage.files.table.columns.type')}
                    </th>
                    <th rowSpan={monthKeys.length > 0 ? 2 : 1} className="tm-pm-resource-table-col-name">
                      {t('projectManagerPage.files.table.columns.name')}
                    </th>
                    <th rowSpan={monthKeys.length > 0 ? 2 : 1} className="tm-pm-resource-table-col-unit">
                      {t('projectManagerPage.files.table.columns.unit')}
                    </th>
                    <th rowSpan={monthKeys.length > 0 ? 2 : 1} className="tm-pm-resource-table-col-price">
                      {t('projectManagerPage.files.table.columns.quantity')}
                    </th>
                    <th rowSpan={monthKeys.length > 0 ? 2 : 1} className="tm-pm-features-table-col-date">
                      {t('projectManagerPage.files.table.columns.start')}
                    </th>
                    <th rowSpan={monthKeys.length > 0 ? 2 : 1} className="tm-pm-features-table-col-date">
                      {t('projectManagerPage.files.table.columns.finish')}
                    </th>
                    {yearBands.map((band) => (
                      <th
                        key={`year-${band.year}`}
                        className="tm-pm-features-table-col-year"
                        colSpan={band.monthKeys.length}
                        title={monthFromGanttHint}
                      >
                        {t('projectManagerPage.files.table.columns.monthYear', {
                          year: String(band.year),
                        })}
                      </th>
                    ))}
                    <th rowSpan={monthKeys.length > 0 ? 2 : 1} className="tm-pm-features-table-col-remark">
                      {t('projectManagerPage.files.table.columns.remark')}
                    </th>
                    <th
                      rowSpan={monthKeys.length > 0 ? 2 : 1}
                      className="tm-pm-resource-table-col-spacer"
                      aria-hidden
                    />
                  </tr>
                  {monthKeys.length > 0 ? (
                    <tr className="tm-pm-features-table-head-row tm-pm-features-table-head-row--month">
                      {monthKeys.map((monthKey) => {
                        const parsed = parseMonthKey(monthKey)
                        return (
                          <th
                            key={monthKey}
                            className="tm-pm-features-table-col-month"
                            title={
                              parsed
                                ? `${parsed.year}-${String(parsed.monthIndex + 1).padStart(2, '0')} · ${monthFromGanttHint}`
                                : monthFromGanttHint
                            }
                          >
                            {parsed
                              ? t('projectManagerPage.files.table.columns.monthPart', {
                                  month: String(parsed.monthIndex + 1),
                                })
                              : monthKey}
                          </th>
                        )
                      })}
                    </tr>
                  ) : null}
                </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const depth = featureRowDepth(row, byId)
                  const isSelected = selectedId === row.id
                  const isChecked = checkedIds.has(row.id)
                  const rollup = rollups.get(row.id)
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
                      onContextMenu={(event) => handleRowContextMenu(event, row.id)}
                    >
                      <td className="tm-pm-resource-table-index">
                        {selectionMode ? (
                          <label
                            className="tm-kb-file-card-select"
                            title={`${t('projectManagerPage.files.table.selection.checkboxColumn')} ${index + 1}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="tm-kb-file-card-select-input"
                              checked={isChecked}
                              aria-label={`${t('projectManagerPage.files.table.selection.checkboxColumn')} ${index + 1}`}
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
                              type: event.target.value as PmFeatureType,
                            })
                          }
                          onClick={(event) => event.stopPropagation()}
                        >
                          {PM_FEATURE_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {t(`projectManagerPage.files.menu.${type}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="tm-pm-resource-table-col-name">
                        <input
                          className="tm-pm-resource-table-input tm-pm-features-table-name-input"
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          value={row.name}
                          title={row.name.trim() || undefined}
                          placeholder={t('projectManagerPage.files.table.namePlaceholder')}
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
                        <span
                          className="tm-pm-features-table-rollup"
                          title={quantityFromGanttHint}
                        >
                          {formatRollupQuantity(rollup?.quantity)}
                        </span>
                      </td>
                      <td className="tm-pm-resource-table-cell--center">
                        <span className="tm-pm-features-table-rollup">
                          {formatWorkItemDate(rollup?.startDate ?? undefined)}
                        </span>
                      </td>
                      <td className="tm-pm-resource-table-cell--center">
                        <span className="tm-pm-features-table-rollup">
                          {formatWorkItemDate(rollup?.finishDate ?? undefined)}
                        </span>
                      </td>
                      {monthKeys.map((monthKey) => (
                        <td
                          key={monthKey}
                          className="tm-pm-resource-table-cell--center tm-pm-features-table-month"
                        >
                          <span
                            className="tm-pm-features-table-rollup"
                            title={monthFromGanttHint}
                          >
                            {formatRollupMonthQuantity(rollup?.monthly[monthKey])}
                          </span>
                        </td>
                      ))}
                      <td>
                        <input
                          className="tm-pm-resource-table-input"
                          value={row.remark}
                          placeholder={t('projectManagerPage.files.table.remarkPlaceholder')}
                          onChange={(event) => patchRow(row.id, { remark: event.target.value })}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                    </tr>
                  )
                })}
              </tbody>
            </table>
              )}
            </div>
          </div>
          {hScrollMetrics.overflowing ? (
            <div
              ref={hTrackRef}
              className="tm-pm-gantt-grid-custom-hscroll"
              onPointerDown={onHTrackPointerDown}
              role="scrollbar"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                (hScrollMetrics.thumbOffset /
                  Math.max(1, (tableScrollRef.current?.clientWidth ?? 1) - hScrollMetrics.thumbSize)) *
                  100,
              )}
            >
              <div
                className="tm-pm-gantt-grid-custom-hscroll-thumb"
                style={{
                  width: `${hScrollMetrics.thumbSize}px`,
                  left: `${hScrollMetrics.thumbOffset}px`,
                }}
              />
            </div>
          ) : null}
        </div>
      )}

      <footer className="tm-pm-gantt-statusbar" aria-live="polite">
        <div
          className={[
            'tm-pm-gantt-statusbar-message',
            dirty
              ? 'tm-pm-gantt-statusbar-message--info'
              : 'tm-pm-gantt-statusbar-message--muted',
          ].join(' ')}
        >
          {dirty
            ? t('projectManagerPage.files.table.statusDirty', {
                count: String(visibleRows.length),
              })
            : t('projectManagerPage.files.table.statusReady', {
                count: String(visibleRows.length),
              })}
          {selectedRow?.name
            ? ` · ${t('projectManagerPage.files.table.statusSelected', {
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
                aria-label={t('projectManagerPage.files.table.selection.cancel')}
                onClick={() => setContextMenu(null)}
              />
              <div
                className="tm-group-context-menu"
                style={{ left: contextMenu.left, top: contextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleSelectAll()
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.files.table.selection.selectAll')}
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
                  }}
                >
                  {t('projectManagerPage.files.table.selection.deleteSelected')}
                  {checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMatrixLayout((current) =>
                      current === 'horizontal' ? 'vertical' : 'horizontal',
                    )
                    setContextMenu(null)
                  }}
                >
                  {matrixLayout === 'horizontal'
                    ? t('projectManagerPage.files.table.selection.layoutVertical')
                    : t('projectManagerPage.files.table.selection.layoutHorizontal')}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleClearSelection()
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.files.table.selection.cancel')}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('projectManagerPage.files.table.selection.deleteSelectedTitle')}
          message={t('projectManagerPage.files.table.selection.deleteSelectedConfirm', {
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
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            onProjectsChange?.()
          }}
        />
      ) : null}
    </div>
  )
}

export default ProjectManagementFilesPanel
