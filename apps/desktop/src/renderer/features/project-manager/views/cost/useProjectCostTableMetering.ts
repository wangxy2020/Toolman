import { useCallback, useEffect, useMemo } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { formatWorkItemDate, parseDateInput } from '../schedule/pm-gantt-utils'
import type { PmCostRow } from './pm-cost-catalog'
import { rollCostMeteringPeriodIntoPrior } from './pm-cost-metering-cols'
import { stripCostIpcQuantities } from './pm-cost-ipc-cols'
import {
  addMeteringBaseline,
  deleteMeteringBaseline,
  nextMeteringPeriodIndex,
  nextMeteringPeriodName,
  parseMeteringPeriodNameIndex,
  readMeteringBaselines,
  readMeteringRollupMode,
  updateMeteringBaseline,
  writeMeteringRollupMode,
  type MeteringBaseline,
  type MeteringRollupMode,
} from './pm-metering-baselines'

export function useProjectCostTableMetering(args: {
  workspaceId: string
  scopeKey: string
  meteringBaselines: MeteringBaseline[]
  setMeteringBaselines: (v: MeteringBaseline[]) => void
  selectedMeteringBaselineId: string | null
  setSelectedMeteringBaselineId: import('react').Dispatch<import('react').SetStateAction<string | null>>
  setMeteringViewActive: (v: boolean) => void
  setMeteringRollupMode: (mode: MeteringRollupMode) => void
  meteringCaptureBaselineOpen: boolean
  setMeteringCaptureBaselineOpen: (v: boolean) => void
  setMeteringEditBaselineOpen: (v: boolean) => void
  setPendingMeteringDeleteBaseline: (v: boolean) => void
  updateRows: (updater: (prev: PmCostRow[]) => PmCostRow[]) => void
  setStatusFeedback: ReturnType<typeof usePmStatusFeedback>[1]
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, scopeKey, meteringBaselines, setMeteringBaselines,
    selectedMeteringBaselineId, setSelectedMeteringBaselineId, setMeteringViewActive,
    setMeteringRollupMode, meteringCaptureBaselineOpen, setMeteringCaptureBaselineOpen,
    setMeteringEditBaselineOpen, setPendingMeteringDeleteBaseline, updateRows, setStatusFeedback, t,
  } = args

  useEffect(() => {
    if (!scopeKey) {
      setMeteringBaselines([])
      setSelectedMeteringBaselineId(null)
      setMeteringRollupMode('none')
      return
    }
    const loaded = readMeteringBaselines(workspaceId, scopeKey)
    setMeteringBaselines(loaded)
    setSelectedMeteringBaselineId((prev) =>
      prev && loaded.some((entry) => entry.id === prev) ? prev : null,
    )
    setMeteringRollupMode(readMeteringRollupMode(workspaceId, scopeKey))
  }, [scopeKey, workspaceId])

  const handleMeteringRollupModeChange = useCallback(
    (mode: MeteringRollupMode) => {
      setMeteringRollupMode(mode)
      if (scopeKey) {
        writeMeteringRollupMode(workspaceId, scopeKey, mode)
      }
    },
    [scopeKey, workspaceId],
  )

  const selectedMeteringBaseline = useMemo(
    () =>
      selectedMeteringBaselineId
        ? (meteringBaselines.find((entry) => entry.id === selectedMeteringBaselineId) ?? null)
        : null,
    [meteringBaselines, selectedMeteringBaselineId],
  )

  const nextMeteringCaptureBaselineIndex = useMemo(
    () => nextMeteringPeriodIndex(meteringBaselines),
    [meteringBaselines],
  )

  const nextMeteringCaptureAsOfMs = useMemo(() => Date.now(), [meteringCaptureBaselineOpen])

  const nextMeteringCaptureBaselineName = useMemo(
    () =>
      nextMeteringPeriodName(
        meteringBaselines,
        formatWorkItemDate(nextMeteringCaptureAsOfMs),
      ),
    [meteringBaselines, nextMeteringCaptureAsOfMs],
  )

  const editMeteringBaselineNameIndex = selectedMeteringBaseline
    ? (parseMeteringPeriodNameIndex(selectedMeteringBaseline.name) ??
      nextMeteringCaptureBaselineIndex)
    : nextMeteringCaptureBaselineIndex

  const editMeteringBaselineInitialDateMs = selectedMeteringBaseline
    ? (parseDateInput(selectedMeteringBaseline.asOfDate) ?? Date.now())
    : Date.now()

  const handleMeteringCaptureBaselineConfirm = useCallback(
    ({ name, asOfDate }: { name: string; asOfDate: string }) => {
      setMeteringCaptureBaselineOpen(false)
      if (!scopeKey) return
      const created = addMeteringBaseline(workspaceId, scopeKey, { name, asOfDate })
      updateRows((prev) => rollCostMeteringPeriodIntoPrior(prev, created.id))
      setMeteringBaselines(readMeteringBaselines(workspaceId, scopeKey))
      setSelectedMeteringBaselineId(created.id)
      setMeteringViewActive(true)
      setStatusFeedback({
        tone: 'success',
        text: t('projectManagerPage.costTable.meteringBaselineCapture.success', {
          name: created.name,
        }),
      })
    },
    [scopeKey, setStatusFeedback, t, updateRows, workspaceId],
  )

  const handleMeteringEditBaselineConfirm = useCallback(
    ({ name, asOfDate }: { name: string; asOfDate: string }) => {
      setMeteringEditBaselineOpen(false)
      if (!scopeKey || !selectedMeteringBaselineId) return
      const updated = updateMeteringBaseline(workspaceId, scopeKey, selectedMeteringBaselineId, {
        name,
        asOfDate,
      })
      if (!updated) return
      setMeteringBaselines(readMeteringBaselines(workspaceId, scopeKey))
      setStatusFeedback({
        tone: 'success',
        text: t('projectManagerPage.costTable.meteringBaselineEdit.success', {
          name: updated.name,
        }),
      })
    },
    [scopeKey, selectedMeteringBaselineId, setStatusFeedback, t, workspaceId],
  )

  const handleConfirmMeteringDeleteBaseline = useCallback(() => {
    setPendingMeteringDeleteBaseline(false)
    if (!scopeKey || !selectedMeteringBaselineId) return
    const removed = deleteMeteringBaseline(workspaceId, scopeKey, selectedMeteringBaselineId)
    if (!removed) return
    updateRows((prev) => stripCostIpcQuantities(prev, removed.id))
    setMeteringBaselines(readMeteringBaselines(workspaceId, scopeKey))
    setSelectedMeteringBaselineId(null)
    setStatusFeedback({
      tone: 'success',
      text: t('projectManagerPage.costTable.meteringBaselineDelete.success', {
        name: removed.name,
      }),
    })
  }, [
    scopeKey,
    selectedMeteringBaselineId,
    setStatusFeedback,
    t,
    updateRows,
    workspaceId,
  ])

  return {
    handleMeteringRollupModeChange,
    selectedMeteringBaseline,
    nextMeteringCaptureBaselineIndex,
    nextMeteringCaptureAsOfMs,
    nextMeteringCaptureBaselineName,
    editMeteringBaselineNameIndex,
    editMeteringBaselineInitialDateMs,
    handleMeteringCaptureBaselineConfirm,
    handleMeteringEditBaselineConfirm,
    handleConfirmMeteringDeleteBaseline,
  }
}
