import type { Dispatch, SetStateAction } from 'react'
import {
  readCostLastSavedAt,
  readCostSaveHistory,
  readCostVersion,
  removeCostSaveHistoryEntry,
  type PmCostSaveRecord,
} from '@toolman/shared'
import { pmApi } from '../../pm-api'
import { getCostCardCurrency } from '../cost/pm-cost-currency'
import {
  readSharedCostLastSavedAt,
  readSharedCostSaveHistory,
  readSharedCostVersion,
  removeSharedCostSaveHistoryEntry,
} from '../cost/pm-cost-catalog'
import {
  readCostPracticeLastSavedAt,
  readCostPracticeSaveHistory,
  readCostPracticeVersion,
  removeCostPracticeSaveHistoryEntry,
} from '../cost/pm-cost-practice-catalog'
import type { ProjectInfoDraft, Props } from './pm-project-info-dialog-utils'
import type { PmProject } from '@toolman/shared'

export function useProjectInfoDialogCost(args: {
  project: PmProject | null
  props: Props
  draft: ProjectInfoDraft
  setDraft: Dispatch<SetStateAction<ProjectInfoDraft>>
  isWorkspaceCost: boolean
  workspaceCostId: string | null
  practiceScopeId: string | null
  t: (key: string, vars?: Record<string, string>) => string
  setCostHistoryRows: Dispatch<SetStateAction<PmCostSaveRecord[]>>
  setCostVersion: Dispatch<SetStateAction<number>>
  setLastSavedAt: Dispatch<SetStateAction<number | null>>
  setDeletingHistoryVersion: Dispatch<SetStateAction<number | null>>
  setError: Dispatch<SetStateAction<string | null>>
}) {
  const {
    project,
    props,
    draft,
    setDraft,
    isWorkspaceCost,
    workspaceCostId,
    practiceScopeId,
    t,
    setCostHistoryRows,
    setCostVersion,
    setLastSavedAt,
    setDeletingHistoryVersion,
    setError,
  } = args

  const costCardCurrency = (cardKey: string) =>
    getCostCardCurrency(draft.costCurrencies, draft.unsetCostCurrency, cardKey)

  const patchCostCardCurrency = (cardKey: string, value: string) => {
    setDraft((current) => ({
      ...current,
      costCurrencies: { ...current.costCurrencies, [cardKey]: value },
    }))
  }

  const reloadWorkspaceCostHistory = () => {
    if (!workspaceCostId) return
    if (practiceScopeId) {
      setCostHistoryRows(readCostPracticeSaveHistory(workspaceCostId, practiceScopeId))
      setCostVersion(readCostPracticeVersion(workspaceCostId, practiceScopeId))
      setLastSavedAt(readCostPracticeLastSavedAt(workspaceCostId, practiceScopeId))
      return
    }
    setCostHistoryRows(readSharedCostSaveHistory(workspaceCostId))
    setCostVersion(readSharedCostVersion(workspaceCostId))
    setLastSavedAt(readSharedCostLastSavedAt(workspaceCostId))
  }

  const handleDeleteCostHistoryEntry = async (entry: PmCostSaveRecord) => {
    const confirmed = window.confirm(
      t('projectManagerPage.projectInfo.saveHistoryDeleteConfirmCost', {
        version: String(entry.version),
      }),
    )
    if (!confirmed) return

    setDeletingHistoryVersion(entry.version)
    setError(null)
    try {
      if (isWorkspaceCost && workspaceCostId) {
        if (practiceScopeId) {
          const nextMeta = removeCostPracticeSaveHistoryEntry(
            workspaceCostId,
            practiceScopeId,
            entry.version,
          )
          setCostHistoryRows(readCostSaveHistory(nextMeta))
          setCostVersion(readCostVersion(nextMeta))
          setLastSavedAt(readCostLastSavedAt(nextMeta))
          if (props.mode === 'workspaceCost') props.onSaved?.()
          return
        }
        const nextMeta = removeSharedCostSaveHistoryEntry(workspaceCostId, entry.version)
        setCostHistoryRows(readCostSaveHistory(nextMeta))
        setCostVersion(readCostVersion(nextMeta))
        setLastSavedAt(readCostLastSavedAt(nextMeta))
        if (props.mode === 'workspaceCost') props.onSaved?.()
        return
      }
      if (!project) return
      if (practiceScopeId) {
        const nextMeta = removeCostPracticeSaveHistoryEntry(
          project.workspaceId,
          practiceScopeId,
          entry.version,
        )
        setCostHistoryRows(readCostSaveHistory(nextMeta))
        setCostVersion(readCostVersion(nextMeta))
        setLastSavedAt(readCostLastSavedAt(nextMeta))
        props.onSaved?.(project)
        return
      }
      const nextMeta = removeCostSaveHistoryEntry(project.metadata ?? {}, entry.version)
      const updated = await pmApi.updateProject({
        id: project.id,
        metadata: nextMeta,
      })
      setCostHistoryRows(readCostSaveHistory(updated.metadata))
      setCostVersion(readCostVersion(updated.metadata))
      setLastSavedAt(readCostLastSavedAt(updated.metadata))
      if (props.mode !== 'workspaceCost') {
        props.onSaved?.(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingHistoryVersion(null)
    }
  }

  return { costCardCurrency, patchCostCardCurrency, reloadWorkspaceCostHistory, handleDeleteCostHistoryEntry }
}
