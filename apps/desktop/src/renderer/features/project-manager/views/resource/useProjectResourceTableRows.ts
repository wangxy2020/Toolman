import { useCallback } from 'react'
import { findDemoteParentId } from '../schedule/pm-gantt-tree'
import {
  createEmptyResourceRow,
  resourceRowDepth,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog'
import { expandDeleteIds } from './pm-resource-panel-utils'

export function useProjectResourceTableRows(args: {
  canEdit: boolean
  addType: PmResourceType
  addCustomTypeName: string
  viewApplicable: string
  selectedId: string | null
  setSelectedId: (id: string | null | ((c: string | null) => string | null)) => void
  checkedIds: Set<string>
  setCheckedIds: (ids: Set<string>) => void
  setSelectionMode: (v: boolean) => void
  setPendingDelete: (ids: Set<string> | null) => void
  updateRows: (updater: (prev: PmResourceRow[]) => PmResourceRow[]) => void
}) {
  const {
    canEdit, addType, addCustomTypeName, viewApplicable, selectedId, setSelectedId, checkedIds,
    setCheckedIds, setSelectionMode, setPendingDelete, updateRows,
  } = args

  const handleAdd = useCallback(() => {
    if (!canEdit) return
    updateRows((prev) => {
      const next = createEmptyResourceRow(
        prev.length,
        addType,
        null,
        viewApplicable,
        addCustomTypeName,
      )
      setSelectedId(next.id)
      return [...prev, next]
    })
  }, [addCustomTypeName, addType, canEdit, updateRows, viewApplicable])

  const handleInsert = useCallback(() => {
    if (!canEdit || !selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index < 0) return prev
      const parentId = prev[index]?.parentId ?? null
      const next = createEmptyResourceRow(
        index,
        addType,
        parentId,
        viewApplicable,
        addCustomTypeName,
      )
      setSelectedId(next.id)
      const copy = [...prev]
      copy.splice(index, 0, next)
      return copy
    })
  }, [addCustomTypeName, addType, canEdit, selectedId, updateRows, viewApplicable])

  const deleteIds = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return
      updateRows((prev) => {
        const remove = expandDeleteIds(prev, ids)
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
    const ids: Set<string> =
      checkedIds.size > 0 ? checkedIds : selectedId ? new Set([selectedId]) : new Set()
    if (ids.size === 0) return
    setPendingDelete(ids)
  }, [checkedIds, selectedId])

  const handleIndent = useCallback(() => {
    if (!selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index <= 0) return prev
      const byIdMap = new Map(prev.map((row) => [row.id, row]))
      const depthRows = prev.map((row) => ({
        item: { id: row.id, parentId: row.parentId },
        depth: resourceRowDepth(row, byIdMap),
      }))
      const parentId = findDemoteParentId(depthRows, index)
      if (!parentId) return prev
      return prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, parentId } : row,
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
    (type: PmResourceType, customTypeName?: string) => {
      if (!selectedId) return
      updateRows((prev) =>
        prev.map((row) =>
          row.id === selectedId
            ? {
                ...row,
                type,
                customTypeName: type === 'custom' ? (customTypeName ?? row.customTypeName) : '',
              }
            : row,
        ),
      )
    },
    [selectedId, updateRows],
  )

  return { handleAdd, handleInsert, deleteIds, handleDelete, handleIndent, handleOutdent, handleMove, handleTypeChange }
}
