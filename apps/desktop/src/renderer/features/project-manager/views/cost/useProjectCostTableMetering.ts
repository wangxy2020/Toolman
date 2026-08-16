import { useCallback, useEffect, useMemo } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { formatWorkItemDate, parseDateInput } from '../schedule/pm-gantt-utils'
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
  isPractice: boolean
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
  setStatusFeedback: ReturnType<typeof usePmStatusFeedback>[1]
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, scopeKey, meteringBaselines, setMeteringBaselines,
    selectedMeteringBaselineId, setSelectedMeteringBaselineId, setMeteringViewActive,
    setMeteringRollupMode, meteringCaptureBaselineOpen, setMeteringCaptureBaselineOpen,
    setMeteringEditBaselineOpen, setPendingMeteringDeleteBaseline, setStatusFeedback, t,
  } = args

  useEffect(() => {
    if (isPractice || !scopeKey) {
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
  }, [isPractice, scopeKey, workspaceId])

  const handleMeteringRollupModeChange = useCallback(
    (mode: MeteringRollupMode) => {
      setMeteringRollupMode(mode)
      if (!isPractice && scopeKey) {
        writeMeteringRollupMode(workspaceId, scopeKey, mode)
      }
    },
    [isPractice, scopeKey, workspaceId],
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
      if (isPractice || !scopeKey) return
      const created = addMeteringBaseline(workspaceId, scopeKey, { name, asOfDate })
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
    [isPractice, scopeKey, setStatusFeedback, t, workspaceId],
  )

  const handleMeteringEditBaselineConfirm = useCallback(
    ({ name, asOfDate }: { name: string; asOfDate: string }) => {
      setMeteringEditBaselineOpen(false)
      if (isPractice || !scopeKey || !selectedMeteringBaselineId) return
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
    [
      isPractice,
      scopeKey,
      selectedMeteringBaselineId,
      setStatusFeedback,
      t,
      workspaceId,
    ],
  )

  const handleConfirmMeteringDeleteBaseline = useCallback(() => {
    setPendingMeteringDeleteBaseline(false)
    if (isPractice || !scopeKey || !selectedMeteringBaselineId) return
    const removed = deleteMeteringBaseline(workspaceId, scopeKey, selectedMeteringBaselineId)
    if (!removed) return
    setMeteringBaselines(readMeteringBaselines(workspaceId, scopeKey))
    setSelectedMeteringBaselineId(null)
    setStatusFeedback({
      tone: 'success',
      text: t('projectManagerPage.costTable.meteringBaselineDelete.success', {
        name: removed.name,
      }),
    })
  }, [
    isPractice,
    scopeKey,
    selectedMeteringBaselineId,
    setStatusFeedback,
    t,
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
