import type { FC, KeyboardEvent, MouseEvent, UIEvent, WheelEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import { IconChevronDown, IconChevronRight } from '../../../../components/icons'
import { useI18n } from '../../../../i18n/useI18n'
import type { GanttTreeRow } from './pm-gantt-tree'
import { resolveGanttTaskKind } from './pm-gantt-tree'
import {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  buildGridTemplateColumns,
  createCustomColumnId,
  customColumnMetaKey,
  GANTT_BUILTIN_COLUMNS,
  insertColumnInCanonicalOrder,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
  resolveColumnLabel,
  type GanttBuiltinColumn,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import {
  formatWorkItemDate,
  GANTT_ROW_HEIGHT,
  isGanttProjectRootId,
  shouldCompletePercent,
  workItemDurationDays,
} from './pm-gantt-utils'
import { formatPredecessorsForItem } from './pm-predecessor-utils'

export type GanttColumnKey = GanttBuiltinColumn
export type GanttEditableField = Exclude<GanttColumnKey, 'index'> | string

export type GanttColumnLabels = Record<GanttBuiltinColumn, string>

type EditTarget =
  | { kind: 'header'; columnId: string }
  | { kind: 'cell'; itemId: string; field: string }

type ContextMenuState = {
  top: number
  /** Distance from viewport right edge — anchors menu to open leftward. */
  right: number
}

type RowContextMenuState = {
  top: number
  left: number
  itemId: string
}

interface Props {
  rows: GanttTreeRow[]
  relations: PmWorkItemRelation[]
  indexById: Map<string, number>
  criticalIds?: ReadonlySet<string>
  prefs: GanttUiPrefs
  builtinLabels: GanttColumnLabels
  headerHeight: number
  selectedId: string | null
  checkedIds: ReadonlySet<string>
  listView?: boolean
  printLayout?: boolean
  gridScrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  onWheelScroll?: (deltaY: number) => void
  onSelect: (itemId: string) => void
  onToggleChecked: (itemId: string) => void
  onSelectAllRows: () => void
  onClearRowSelection: () => void
  onDeleteSelectedRows: () => void
  onToggleCollapse: (itemId: string) => void
  onPrefsChange: (prefs: GanttUiPrefs) => void
  onCommitCell: (itemId: string, field: string, rawValue: string) => void | Promise<void>
  /** Change this (e.g. project id) to exit multi-select mode. */
  selectionResetKey?: string | null
}

export const ProjectGanttTaskGrid: FC<Props> = ({
  rows,
  relations,
  indexById,
  criticalIds,
  prefs,
  builtinLabels,
  headerHeight,
  selectedId,
  checkedIds,
  listView = false,
  printLayout = false,
  gridScrollRef,
  onScroll,
  onWheelScroll,
  onSelect,
  onToggleChecked,
  onSelectAllRows,
  onClearRowSelection,
  onDeleteSelectedRows,
  onToggleCollapse,
  onPrefsChange,
  onCommitCell,
  selectionResetKey = null,
}) => {
  const { t } = useI18n()
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [draft, setDraft] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null)
  /** Index shows numbers until the user opens the row context menu (multi-select). */
  const [selectionMode, setSelectionMode] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const gridTemplate = useMemo(
    () =>
      buildGridTemplateColumns(prefs.columnOrder, {
        fullWidthList: listView,
        printLayout,
      }),
    [prefs.columnOrder, listView, printLayout],
  )

  useEffect(() => {
    setSelectionMode(false)
    setRowContextMenu(null)
  }, [selectionResetKey])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (!contextMenu && !rowContextMenu) return
    const onDoc = () => {
      setContextMenu(null)
      setRowContextMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [contextMenu, rowContextMenu])

  const labelOf = (id: string) => resolveColumnLabel(id, prefs, builtinLabels)
  const menuLabelOf = (id: string) => labelOf(id).replace(/\n/g, '')

  const patchPrefs = (patch: Partial<GanttUiPrefs> | ((current: GanttUiPrefs) => GanttUiPrefs)) => {
    const next = typeof patch === 'function' ? patch(prefs) : { ...prefs, ...patch }
    onPrefsChange(next)
  }

  const openColumnMenu = (anchorLeft: number, anchorBottom: number) => {
    const menuMinWidth = 180
    const gap = 4
    // Open to the left of the anchor (from bottom-left toward left).
    const right = Math.max(8, window.innerWidth - anchorLeft + gap)
    const maxRight = window.innerWidth - menuMinWidth - 8
    const clampedRight = Math.min(right, maxRight)
    const estimatedHeight = 320
    let top = anchorBottom + gap
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, anchorBottom - estimatedHeight)
    }
    setContextMenu({ top, right: clampedRight })
  }

  const startEdit = (target: EditTarget, value: string) => {
    if (target.kind === 'header' && target.columnId === 'index') return
    setEditing(target)
    setDraft(value)
  }

  const cancelEdit = () => {
    setEditing(null)
    setDraft('')
  }

  const commitEdit = () => {
    if (!editing) return
    if (editing.kind === 'header') {
      const next = draft.trim()
      if (next) {
        patchPrefs({
          columnLabels: { ...prefs.columnLabels, [editing.columnId]: next },
          customColumns: prefs.customColumns.map((col) =>
            col.id === editing.columnId ? { ...col, label: next } : col,
          ),
        })
      }
    } else {
      void onCommitCell(editing.itemId, editing.field, draft)
    }
    cancelEdit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
    }
  }

  const toggleColumnVisible = (id: string) => {
    if (id === 'name') return
    patchPrefs((current) => {
      if (current.columnOrder.includes(id)) {
        return {
          ...current,
          columnOrder: current.columnOrder.filter((entry) => entry !== id),
        }
      }
      return {
        ...current,
        columnOrder: insertColumnInCanonicalOrder(
          current.columnOrder,
          id,
          current.customColumns,
        ),
      }
    })
  }

  const addCustomColumn = () => {
    const label = window.prompt(t('projectManagerPage.schedule.addCustomColumnPrompt'))?.trim()
    if (!label) return
    const id = createCustomColumnId()
    patchPrefs({
      customColumns: [...prefs.customColumns, { id, label }],
      columnOrder: [...prefs.columnOrder, id],
      columnLabels: { ...prefs.columnLabels, [id]: label },
    })
    setContextMenu(null)
  }

  const cellValue = (item: PmWorkItem, field: string): string => {
    if (isGanttCustomColumnId(field) || (!isGanttBuiltinColumn(field) && field !== 'index')) {
      const raw = item.metadata?.[customColumnMetaKey(field)]
      return raw == null ? '' : String(raw)
    }
    switch (field as GanttEditableField) {
      case 'name':
        return item.title
      case 'duration':
        return `${workItemDurationDays(item)}${t('projectManagerPage.schedule.dayUnit')}`
      case 'start':
        return formatWorkItemDate(item.startDate)
      case 'finish':
        return formatWorkItemDate(item.dueDate)
      case 'predecessors':
        return formatPredecessorsForItem(relations, item.id, indexById)
      case 'actualStart': {
        const raw = item.metadata?.[ACTUAL_START_META_KEY]
        const ms = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
        return ms != null && Number.isFinite(ms) ? formatWorkItemDate(ms) : ''
      }
      case 'actualFinish': {
        const raw = item.metadata?.[ACTUAL_FINISH_META_KEY]
        const ms = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
        return ms != null && Number.isFinite(ms) ? formatWorkItemDate(ms) : ''
      }
      case 'shouldPercentComplete':
        return `${shouldCompletePercent(item)}%`
      case 'percentComplete':
        return `${item.progressPercent}%`
      default:
        return ''
    }
  }

  const renderHeaderCell = (columnId: string) => {
    const isEditing = editing?.kind === 'header' && editing.columnId === columnId
    const editable = columnId !== 'index'
    return (
      <span
        key={columnId}
        className={`tm-pm-gantt-col tm-pm-gantt-col--${isGanttBuiltinColumn(columnId) ? columnId : 'custom'}`}
        onDoubleClick={
          editable ? () => startEdit({ kind: 'header', columnId }, labelOf(columnId)) : undefined
        }
        onContextMenu={(event: MouseEvent) => {
          event.preventDefault()
          openColumnMenu(event.clientX, event.clientY)
        }}>
        {isEditing ? (
          <input
            ref={inputRef}
            className="tm-pm-gantt-cell-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
          />
        ) : labelOf(columnId).includes('\n') ? (
          <span className="tm-pm-gantt-col-label-wrap">
            {labelOf(columnId)
              .split('\n')
              .map((line) => (
                <span key={line}>{line}</span>
              ))}
          </span>
        ) : (
          labelOf(columnId)
        )}
      </span>
    )
  }

  const renderBodyCell = (row: GanttTreeRow, field: string) => {
    const { item, depth, hasChildren, expanded } = row
    const isEditing =
      editing?.kind === 'cell' && editing.itemId === item.id && editing.field === field
    const value = cellValue(item, field)
    const onCritical = criticalIds?.has(item.id) ?? false
    const kind = resolveGanttTaskKind(item, hasChildren, onCritical)

    if (field === 'index') {
      const isProjectRoot = isGanttProjectRootId(item.id)
      const checked = checkedIds.has(item.id)
      const checkboxTitle = `${t('projectManagerPage.schedule.selection.checkboxColumn')} ${row.rowNumber}`
      return (
        <span
          key={field}
          className="tm-pm-gantt-col tm-pm-gantt-col--index"
          onClick={(event) => event.stopPropagation()}>
          {printLayout || !selectionMode || isProjectRoot ? (
            row.rowNumber > 0 ? row.rowNumber : ''
          ) : (
            <label className="tm-kb-file-card-select" title={checkboxTitle}>
              <input
                type="checkbox"
                className="tm-kb-file-card-select-input"
                checked={checked}
                aria-label={checkboxTitle}
                onChange={() => onToggleChecked(item.id)}
                onClick={(event) => event.stopPropagation()}
              />
              <span
                className={[
                  'tm-kb-file-card-select-box',
                  checked ? 'tm-kb-file-card-select-box--checked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              />
            </label>
          )}
        </span>
      )
    }

    if (field === 'name') {
      const isProjectRoot = isGanttProjectRootId(item.id)
      return (
        <span
          key={field}
          className="tm-pm-gantt-col tm-pm-gantt-col--name"
          style={{ paddingLeft: `${4 + depth * 14}px` }}
          onDoubleClick={
            isProjectRoot
              ? undefined
              : () => startEdit({ kind: 'cell', itemId: item.id, field }, value)
          }>
          {hasChildren ? (
            <button
              type="button"
              className="tm-pm-gantt-fold-btn"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapse(item.id)
              }}>
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </button>
          ) : (
            <span className="tm-pm-gantt-fold-placeholder" />
          )}
          {isEditing ? (
            <input
              ref={inputRef}
              className="tm-pm-gantt-cell-input tm-pm-gantt-cell-input--name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span
              className={[
                'tm-pm-gantt-cell-text',
                kind === 'summary' || isProjectRoot ? 'tm-pm-gantt-cell-text--summary' : '',
                onCritical ? 'tm-pm-gantt-cell-text--critical' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={item.title}>
              {item.title}
            </span>
          )}
        </span>
      )
    }

    const isProjectRoot = isGanttProjectRootId(item.id)
    return (
      <span
        key={field}
        className={`tm-pm-gantt-col tm-pm-gantt-col--${isGanttBuiltinColumn(field) ? field : 'custom'}`}
        onDoubleClick={(event) => {
          if (isProjectRoot) return
          event.stopPropagation()
          startEdit({ kind: 'cell', itemId: item.id, field }, value)
        }}>
        {isEditing ? (
          <input
            ref={inputRef}
            className="tm-pm-gantt-cell-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          value || '—'
        )}
      </span>
    )
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (listView || !onWheelScroll) return
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
    event.preventDefault()
    onWheelScroll(event.deltaY)
  }

  return (
    <div className="tm-pm-gantt-grid-pane">
      <div className="tm-pm-gantt-grid-hscroll">
        <div className="tm-pm-gantt-grid-inner">
          <div
            className="tm-pm-gantt-grid-header"
            style={{ height: headerHeight, gridTemplateColumns: gridTemplate }}>
            {prefs.columnOrder.map((columnId) => renderHeaderCell(columnId))}
          </div>
          <div
            ref={gridScrollRef}
            className="tm-pm-gantt-grid-body"
            onScroll={onScroll}
            onWheel={handleWheel}>
            {rows.map((row) => {
              const active = row.item.id === selectedId
              const checked = checkedIds.has(row.item.id)
              const isProjectRoot = isGanttProjectRootId(row.item.id)
              return (
                <div
                  key={row.item.id}
                  role="row"
                  tabIndex={0}
                  className={[
                    'tm-pm-gantt-grid-row',
                    active ? 'tm-pm-gantt-grid-row--active' : '',
                    checked ? 'tm-pm-gantt-grid-row--checked' : '',
                    isProjectRoot ? 'tm-pm-gantt-grid-row--project-root' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ height: GANTT_ROW_HEIGHT, gridTemplateColumns: gridTemplate }}
                  onClick={() => onSelect(row.item.id)}
                  onContextMenu={(event) => {
                    if (isProjectRoot) {
                      event.preventDefault()
                      onSelect(row.item.id)
                      return
                    }
                    event.preventDefault()
                    event.stopPropagation()
                    onSelect(row.item.id)
                    setSelectionMode(true)
                    if (!checkedIds.has(row.item.id)) {
                      onToggleChecked(row.item.id)
                    }
                    const menuWidth = 160
                    const left = Math.min(
                      event.clientX,
                      Math.max(8, window.innerWidth - menuWidth - 8),
                    )
                    const top = Math.min(
                      event.clientY,
                      Math.max(8, window.innerHeight - 140),
                    )
                    setContextMenu(null)
                    setRowContextMenu({ top, left, itemId: row.item.id })
                  }}>
                  {prefs.columnOrder.map((columnId) => renderBodyCell(row, columnId))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {contextMenu
        ? createPortal(
            <div
              className="tm-pm-gantt-col-menu"
              style={{ right: contextMenu.right, top: contextMenu.top }}
              onMouseDown={(event) => event.stopPropagation()}>
              <div className="tm-pm-gantt-col-menu-title">
                {t('projectManagerPage.schedule.columnVisibility')}
              </div>
              {GANTT_BUILTIN_COLUMNS.map((key) => {
                const checked = prefs.columnOrder.includes(key)
                const locked = key === 'name'
                return (
                  <label key={key} className="tm-pm-gantt-col-menu-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleColumnVisible(key)}
                    />
                    <span>{menuLabelOf(key)}</span>
                  </label>
                )
              })}
              {prefs.customColumns.map((col) => {
                const checked = prefs.columnOrder.includes(col.id)
                return (
                  <label key={col.id} className="tm-pm-gantt-col-menu-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumnVisible(col.id)}
                    />
                    <span>{menuLabelOf(col.id)}</span>
                  </label>
                )
              })}
              <button
                type="button"
                className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
                onClick={addCustomColumn}>
                {t('projectManagerPage.schedule.addCustomColumn')}
              </button>
            </div>,
            document.body,
          )
        : null}

      {rowContextMenu
        ? createPortal(
            <>
              <button
                type="button"
                className="tm-group-context-menu-backdrop"
                aria-label={t('projectManagerPage.schedule.selection.cancel')}
                onClick={() => setRowContextMenu(null)}
              />
              <div
                className="tm-group-context-menu"
                style={{ left: rowContextMenu.left, top: rowContextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onSelectAllRows()
                    setSelectionMode(true)
                    setRowContextMenu(null)
                  }}>
                  {t('projectManagerPage.schedule.selection.selectAll')}
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
                    setRowContextMenu(null)
                    onDeleteSelectedRows()
                  }}>
                  {t('projectManagerPage.schedule.selection.deleteSelected')}
                  {checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onClearRowSelection()
                    setSelectionMode(false)
                    setRowContextMenu(null)
                  }}>
                  {t('projectManagerPage.schedule.selection.cancel')}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
