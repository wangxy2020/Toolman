import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, type RefObject } from 'react'

import { isPmEditableEventTarget } from '../../pm-editable-dom'
import { useI18n } from '../../../../i18n/useI18n'
import {
  saveCostColumnLabels,
  saveCostColumnVisibility,
  type CostColumnLabels,
  type CostLabelColumn,
  type CostToggleColumn,
} from './pm-cost-column-prefs'
import {
  clampMenuToViewport,
  computeColumnMenuPosition,
  computeRowContextMenuPosition,
} from './pm-cost-panel-utils'
import { appendCostFormulaRef, type CostSummaryRow } from './pm-cost-summary'
import { patchCostSectionMeta, type PmCostRow } from './pm-cost-catalog'

type CostContextMenuState = { left: number; top: number; rowId: string }
type CostColumnMenuState = { left: number; top: number }

export function useProjectCostTableSelection(args: {
  visibleRows: PmCostRow[]
  columnLabels: CostColumnLabels
  setColumnLabels: (fn: (prev: CostColumnLabels) => CostColumnLabels) => void
  setColumnVisibility: (fn: (prev: import('./pm-cost-column-prefs').CostColumnVisibility) => import('./pm-cost-column-prefs').CostColumnVisibility) => void
  totalPriceColumnDefaultLabel: string
  contextMenu: CostContextMenuState | null
  setContextMenu: (v: CostContextMenuState | null | ((c: CostContextMenuState | null) => CostContextMenuState | null)) => void
  setColumnMenu: (v: CostColumnMenuState | null) => void
  columnMenu: CostColumnMenuState | null
  contextMenuRef: RefObject<HTMLDivElement | null>
  editingHeaderColumn: CostLabelColumn | null
  setEditingHeaderColumn: (v: CostLabelColumn | null) => void
  headerDraft: string
  setHeaderDraft: (v: string) => void
  headerInputRef: RefObject<HTMLInputElement | null>
  setCheckedIds: (ids: Set<string>) => void
  setSelectionMode: (v: boolean) => void
  totalFormulaFocusIdRef: { current: string | null }
  formulaInputRef: RefObject<HTMLInputElement | null>
  setSummaryRows: (fn: (prev: CostSummaryRow[]) => CostSummaryRow[]) => void
  setDirty: (v: boolean) => void
  rowsRef: { current: PmCostRow[] }
  updateRows: (updater: (prev: PmCostRow[]) => PmCostRow[], options?: { coalesceMs?: number }) => void
  resolveEditableSummaryRows: () => CostSummaryRow[]
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    visibleRows, columnLabels, setColumnLabels, setColumnVisibility, totalPriceColumnDefaultLabel,
    contextMenu, setContextMenu, setColumnMenu, columnMenu, contextMenuRef, editingHeaderColumn,
    setEditingHeaderColumn, headerDraft, setHeaderDraft, headerInputRef, setCheckedIds,
    setSelectionMode, totalFormulaFocusIdRef, formulaInputRef, setSummaryRows, setDirty, rowsRef,
    updateRows, resolveEditableSummaryRows, t,
  } = args

  const openColumnVisibilityMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    const position = computeColumnMenuPosition(event.clientX, event.clientY, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setColumnMenu(position)
  }, [])

  const costColumnLabel = useCallback(
    (column: CostLabelColumn | 'index') => {
      if (column === 'index') {
        return t('projectManagerPage.costTable.columns.index')
      }
      const override = columnLabels[column]?.trim()
      if (override) return override
      if (column === 'totalPrice') return totalPriceColumnDefaultLabel
      return t(`projectManagerPage.costTable.columns.${column}`)
    },
    [columnLabels, t, totalPriceColumnDefaultLabel],
  )

  const totalPriceColumnLabel = costColumnLabel('totalPrice')

  const startHeaderEdit = useCallback(
    (column: CostLabelColumn) => {
      setColumnMenu(null)
      setContextMenu(null)
      setEditingHeaderColumn(column)
      setHeaderDraft(costColumnLabel(column))
    },
    [costColumnLabel],
  )

  const cancelHeaderEdit = useCallback(() => {
    setEditingHeaderColumn(null)
    setHeaderDraft('')
  }, [])

  const commitHeaderEdit = useCallback(() => {
    if (!editingHeaderColumn) return
    const next = headerDraft.trim()
    if (next) {
      setColumnLabels((prev) => {
        const updated = { ...prev, [editingHeaderColumn]: next }
        saveCostColumnLabels(updated)
        return updated
      })
    }
    cancelHeaderEdit()
  }, [cancelHeaderEdit, editingHeaderColumn, headerDraft])

  const handleHeaderKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commitHeaderEdit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelHeaderEdit()
      }
    },
    [cancelHeaderEdit, commitHeaderEdit],
  )

  useLayoutEffect(() => {
    if (!editingHeaderColumn) return
    const input = headerInputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [editingHeaderColumn])

  const toggleColumnVisibility = useCallback((column: CostToggleColumn) => {
    setColumnVisibility((prev) => {
      if (column === 'name' && prev.name) return prev
      const next = { ...prev, [column]: !prev[column] }
      if (!next.name) next.name = true
      saveCostColumnVisibility(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!columnMenu) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.tm-pm-gantt-col-menu')) return
      setColumnMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColumnMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [columnMenu])

  const handleRowContextMenu = useCallback((event: ReactMouseEvent, rowId: string) => {
    // Keep native cut/copy/paste on editable cells.
    if (isPmEditableEventTarget(event.target)) return
    event.preventDefault()
    setColumnMenu(null)
    // Right-click opens the menu only — do not enter selection mode or check the row.
    const position = computeRowContextMenuPosition(event.clientX, event.clientY, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setContextMenu({ ...position, rowId })
  }, [])

  useLayoutEffect(() => {
    if (!contextMenu) return
    const menu = contextMenuRef.current
    if (!menu) return
    const clamped = clampMenuToViewport(
      { left: contextMenu.left, top: contextMenu.top },
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    if (
      Math.abs(clamped.left - contextMenu.left) > 0.5 ||
      Math.abs(clamped.top - contextMenu.top) > 0.5
    ) {
      setContextMenu((current) => (current ? { ...current, ...clamped } : current))
    }
  }, [contextMenu?.rowId, contextMenu?.left, contextMenu?.top])

  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(visibleRows.map((row) => row.id)))
    setSelectionMode(true)
  }, [visibleRows])

  const handleClearSelection = useCallback(() => {
    setCheckedIds(new Set())
    setSelectionMode(false)
  }, [])

  const appendSectionRefToActiveFormula = useCallback(
    (refName: string) => {
      const focusKey = totalFormulaFocusIdRef.current
      if (!focusKey) return
      const ref = refName.trim()
      if (!ref) return

      if (focusKey.startsWith('summary:')) {
        const summaryId = focusKey.slice('summary:'.length)
        setSummaryRows((prev) => {
          const base = prev.length > 0 ? prev : resolveEditableSummaryRows()
          return base.map((row, index) =>
            row.id === summaryId
              ? {
                  ...row,
                  totalFormula: appendCostFormulaRef(row.totalFormula, ref),
                  sortOrder: index,
                }
              : { ...row, sortOrder: index },
          )
        })
        setDirty(true)
      } else if (focusKey.startsWith('section:')) {
        const rawKey = focusKey.slice('section:'.length)
        const sectionKey = rawKey === '__empty__' ? '' : rawKey
        if (sectionKey === ref) return
        const peer = rowsRef.current.find(
          (row) => (row.sectionalWork?.trim() ?? '') === sectionKey,
        )
        const current = peer?.sectionTotalFormula ?? ''
        updateRows(
          (prev) =>
            patchCostSectionMeta(prev, sectionKey, {
              sectionTotalFormula: appendCostFormulaRef(current, ref),
            }),
          { coalesceMs: 500 },
        )
      }

      requestAnimationFrame(() => {
        formulaInputRef.current?.focus()
      })
    },
    [resolveEditableSummaryRows, updateRows],
  )

  return {
    openColumnVisibilityMenu, costColumnLabel, totalPriceColumnLabel, startHeaderEdit, cancelHeaderEdit,
    commitHeaderEdit, handleHeaderKeyDown, toggleColumnVisibility, handleRowContextMenu,
    handleSelectAll, handleClearSelection, appendSectionRefToActiveFormula,
  }
}
