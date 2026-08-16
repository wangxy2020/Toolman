import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect } from 'react'
import { isPmEditableEventTarget } from '../../pm-editable-dom'
import {
  deriveResourceApplicable,
  isPmResourceCostType,
  isPmResourceType,
  parseCustomTypeSelectValue,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog'
import { saveResourceColumnVisibility, type ResourceToggleColumn } from './pm-resource-column-prefs'
import {
  computeColumnMenuPosition,
  computeResourceBaselineDisplay,
  computeRowContextMenuPosition,
  typeSelectValueForRow,
  type ResourceBaselineDisplay,
} from './pm-resource-panel-utils'
import type { PmProject } from '@toolman/shared'

export function useProjectResourceTableEdit(args: {
  isPractice: boolean
  isAllScope: boolean
  rowsRef: { current: PmResourceRow[] }
  editingProject: PmProject | null
  baselinePriceIndex: Parameters<typeof deriveResourceApplicable>[1]
  updateRows: (updater: (prev: PmResourceRow[]) => PmResourceRow[], options?: { coalesceMs?: number }) => void
  setCheckedIds: import('react').Dispatch<import('react').SetStateAction<Set<string>>>
  setContextMenu: (v: { left: number; top: number; rowId: string } | null) => void
  setColumnMenu: (v: { left: number; top: number } | null) => void
  setColumnVisibility: import('react').Dispatch<import('react').SetStateAction<import('./pm-resource-column-prefs').ResourceColumnVisibility>>
  columnMenu: { left: number; top: number } | null
}) {
  const {
    isPractice, isAllScope, rowsRef, editingProject, baselinePriceIndex, updateRows, setCheckedIds,
    setContextMenu, setColumnMenu, setColumnVisibility, columnMenu,
  } = args

  const patchRow = useCallback(
    (id: string, patch: Partial<PmResourceRow>) => {
      updateRows(
        (prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
        { coalesceMs: 500 },
      )
    },
    [updateRows],
  )

  const applyTypeToRow = useCallback(
    (rowId: string, type: PmResourceType, customTypeName = '') => {
      const row = rowsRef.current.find((entry) => entry.id === rowId)
      if (!row) return
      const nextCustomName = type === 'custom' ? customTypeName.trim() : ''
      const applicable =
        editingProject != null
          ? deriveResourceApplicable(
              { ...row, type, customTypeName: nextCustomName },
              baselinePriceIndex,
              editingProject.id,
            )
          : row.applicable
      patchRow(rowId, { type, customTypeName: nextCustomName, applicable })
    },
    [baselinePriceIndex, editingProject, patchRow],
  )

  const handleTypeSelectChange = useCallback(
    (rowId: string, value: string) => {
      const custom = parseCustomTypeSelectValue(value)
      if (custom) {
        applyTypeToRow(rowId, 'custom', custom.kind === 'named' ? custom.name : '')
        return
      }
      if (!isPmResourceType(value) || isPmResourceCostType(value)) return
      applyTypeToRow(rowId, value)
    },
    [applyTypeToRow],
  )

  const handleRowNameChange = useCallback(
    (row: PmResourceRow, name: string) => {
      const applicable =
        editingProject != null
          ? deriveResourceApplicable({ ...row, name }, baselinePriceIndex, editingProject.id)
          : row.applicable
      patchRow(row.id, { name, applicable })
    },
    [baselinePriceIndex, editingProject, patchRow],
  )

  const handleRowSpecChange = useCallback(
    (rowId: string, spec: string) => {
      patchRow(rowId, { spec })
    },
    [patchRow],
  )

  const handleRowUnitChange = useCallback(
    (row: PmResourceRow, unit: string) => {
      if (isPractice) {
        patchRow(row.id, { unit })
        return
      }
      const pricingInSync = row.pricingUnit.trim() === '' || row.pricingUnit === row.unit
      patchRow(row.id, {
        unit,
        ...(pricingInSync ? { pricingUnit: unit } : {}),
      })
    },
    [isPractice, patchRow],
  )

  const handleRowPricingUnitTextChange = useCallback(
    (rowId: string, pricingUnit: string) => {
      patchRow(rowId, { pricingUnit })
    },
    [patchRow],
  )

  const handleRowPricingUnitCommit = useCallback(
    (rowId: string, next: number | null) => {
      patchRow(rowId, { pricingUnit: next == null ? '' : String(next) })
    },
    [patchRow],
  )

  const handleRowUnitPriceCommit = useCallback(
    (row: PmResourceRow, unitPrice: number | null) => {
      const applicable =
        editingProject != null
          ? deriveResourceApplicable({ ...row, unitPrice }, baselinePriceIndex, editingProject.id)
          : row.applicable
      patchRow(row.id, { unitPrice, applicable })
    },
    [baselinePriceIndex, editingProject, patchRow],
  )

  const handleRowNoteChange = useCallback(
    (rowId: string, note: string) => {
      patchRow(rowId, { note })
    },
    [patchRow],
  )

  const handleRowCheckedChange = useCallback((rowId: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }, [])

  const getRowBaselineDisplay = useCallback(
    (row: PmResourceRow): ResourceBaselineDisplay =>
      computeResourceBaselineDisplay(row, baselinePriceIndex, isAllScope),
    [baselinePriceIndex, isAllScope],
  )

  const handleRowContextMenu = useCallback(
    (event: ReactMouseEvent, rowId: string) => {
      if (isPmEditableEventTarget(event.target)) return
      event.preventDefault()
      setColumnMenu(null)
      // Right-click opens the menu only — do not enter selection mode or check the row.
      const { left, top } = computeRowContextMenuPosition(event.clientX, event.clientY, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
      setContextMenu({ left, top, rowId })
    },
    [],
  )

  const openColumnVisibilityMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    const { left, top } = computeColumnMenuPosition(event.clientX, event.clientY, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setColumnMenu({ left, top })
  }, [])

  const toggleColumnVisibility = useCallback((column: ResourceToggleColumn) => {
    setColumnVisibility((prev) => {
      if (column === 'name' && prev.name) return prev
      const next = { ...prev, [column]: !prev[column] }
      if (!next.name) next.name = true
      saveResourceColumnVisibility(next)
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

  return {
    patchRow, applyTypeToRow, handleTypeSelectChange, handleRowNameChange, handleRowSpecChange,
    handleRowUnitChange, handleRowPricingUnitTextChange, handleRowPricingUnitCommit,
    handleRowUnitPriceCommit, handleRowNoteChange, handleRowCheckedChange, getRowBaselineDisplay,
    handleRowContextMenu, openColumnVisibilityMenu, toggleColumnVisibility, typeSelectValueForRow,
  }
}
