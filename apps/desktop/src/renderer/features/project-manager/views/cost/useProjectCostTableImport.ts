import { useCallback, type MutableRefObject } from 'react'

import { DialogSelectFilesOutputSchema, FileReadBinaryOutputSchema, IpcChannel } from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { COST_IMPORT_DIALOG_FILTERS, importCostCatalogFromFile } from './pm-cost-import'
import type { PmCostRow, PmCostType } from './pm-cost-catalog'

export function useProjectCostTableImport(args: {
  canEdit: boolean
  viewApplicable: string
  addType: PmCostType
  rowsRef: MutableRefObject<PmCostRow[]>
  updateRows: (updater: (prev: PmCostRow[]) => PmCostRow[]) => void
  setSelectedId: (id: string | null) => void
  setCheckedIds: (ids: Set<string>) => void
  setPendingImportRows: (v: { rows: PmCostRow[]; sourceName: string } | null) => void
  setStatusFeedback: ReturnType<typeof usePmStatusFeedback>[1]
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    canEdit, viewApplicable, addType, rowsRef, updateRows, setSelectedId, setCheckedIds,
    setPendingImportRows, setStatusFeedback, t,
  } = args

  const applyImportedRows = useCallback(
    (imported: PmCostRow[]) => {
      updateRows(() => imported)
      setSelectedId(null)
      setCheckedIds(new Set())
      setStatusFeedback({
        tone: 'success',
        text: t('projectManagerPage.costTable.importSuccess', {
          count: String(imported.length),
        }),
      })
    },
    [setStatusFeedback, t, updateRows],
  )

  const handleImport = useCallback(async () => {
    if (!canEdit) return
    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      multiple: false,
      title: t('projectManagerPage.costTable.importTitle'),
      buttonLabel: t('projectManagerPage.costTable.menu.import'),
      filters: [...COST_IMPORT_DIALOG_FILTERS],
    })
    if (!pickResult.ok) {
      setStatusFeedback({
        tone: 'error',
        text: t('projectManagerPage.costTable.importFailed', {
          message: pickResult.error.message,
        }),
      })
      return
    }
    const { paths } = DialogSelectFilesOutputSchema.parse(pickResult.data)
    const filePath = paths[0]
    if (!filePath) return

    const readResult = await window.api.invoke(IpcChannel.FileReadBinary, {
      path: filePath,
    })
    if (!readResult.ok) {
      setStatusFeedback({
        tone: 'error',
        text: t('projectManagerPage.costTable.importFailed', {
          message: readResult.error.message,
        }),
      })
      return
    }
    const binary = FileReadBinaryOutputSchema.parse(readResult.data)
    try {
      const imported = await importCostCatalogFromFile({
        fileName: binary.fileName,
        base64: binary.base64,
        applicable: viewApplicable,
        fallbackType: addType,
      })
      const hasExisting = rowsRef.current.some(
        (row) => row.name.trim() || row.code.trim(),
      )
      if (hasExisting) {
        setPendingImportRows({
          rows: imported.rows,
          sourceName: imported.sourceName,
        })
        return
      }
      applyImportedRows(imported.rows)
    } catch (error) {
      setStatusFeedback({
        tone: 'error',
        text: t('projectManagerPage.costTable.importFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      })
    }
  }, [
    addType,
    applyImportedRows,
    canEdit,
    setStatusFeedback,
    t,
    viewApplicable,
  ])

  return { applyImportedRows, handleImport }
}
