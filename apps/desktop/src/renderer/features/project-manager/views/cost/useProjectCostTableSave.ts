import { useCallback, type MutableRefObject } from 'react'

import type { PmProject } from '@toolman/shared'
import { buildCostSaveMetadata, readCostVersion } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import { usePmCatalogAutoSave } from '../../usePmCatalogAutoSave'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import {
  PM_COST_APPLICABLE_ALL,
  PM_COST_CATALOG_KEY,
  buildBaselinePriceIndex,
  fingerprintCostCatalog,
  readSharedCostCatalog,
  readSharedCostVersion,
  recordSharedCostSaveMeta,
  sortCostRowsByTypeMenu,
  sortCostRowsLikeSharedCatalog,
  toCostCatalogSnapshot,
  withDerivedCostApplicable,
  writeSharedCostCatalog,
  type PmCostRow,
} from './pm-cost-catalog'
import {
  readCostPracticeVersion,
  recordCostPracticeSaveMeta,
  writeCostPracticeCatalog,
} from './pm-cost-practice-catalog'
import { COST_SUMMARY_ROWS_META_KEY, type CostSummaryRow } from './pm-cost-summary'

export function useProjectCostTableSave(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  canEdit: boolean
  practiceScopeId: string
  scopeKey: string
  viewApplicable: string
  editingProject: PmProject | null
  rows: PmCostRow[]
  rowsRef: MutableRefObject<PmCostRow[]>
  summaryRows: CostSummaryRow[]
  dirty: boolean
  applyCatalogRows: (catalog: PmCostRow[], options?: { dirty?: boolean; clearHistory?: boolean }) => void
  cleanFingerprintRef: MutableRefObject<string>
  onProjectsChange?: () => void | Promise<void>
  setSaving: (v: boolean) => void
  setStatusFeedback: ReturnType<typeof usePmStatusFeedback>[1]
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, isAllScope, canEdit, practiceScopeId, scopeKey, viewApplicable,
    editingProject, rows, rowsRef, summaryRows, dirty, applyCatalogRows, cleanFingerprintRef,
    onProjectsChange, setSaving, setStatusFeedback, t,
  } = args
  const persistProjectCatalog = useCallback(
    async (
      project: PmProject,
      catalog: PmCostRow[],
      options?: { bumpVersion?: boolean; note?: string },
    ) => {
      const prevVersion = readCostVersion(project.metadata)
      const metadata = {
        ...buildCostSaveMetadata(project.metadata ?? {}, {
          costCount: catalog.length,
          contentFingerprint: fingerprintCostCatalog(catalog),
          catalog: toCostCatalogSnapshot(catalog),
          bumpVersion: options?.bumpVersion ?? false,
          ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
        }),
        [PM_COST_CATALOG_KEY]: catalog,
        [COST_SUMMARY_ROWS_META_KEY]: summaryRows,
      }
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
      return {
        prevVersion,
        nextVersion: readCostVersion(metadata),
      }
    },
    [summaryRows],
  )

  const handleSave = useCallback(
    async (options?: { asNewVersion?: boolean; note?: string }): Promise<boolean> => {
      if (!canEdit) {
        window.alert(t('projectManagerPage.costTable.needProject'))
        return false
      }
      const asNewVersion = options?.asNewVersion === true
      const note = options?.note?.trim() || undefined
      setSaving(true)
      try {
        if (isPractice) {
          if (!practiceScopeId) {
            window.alert(t('projectManagerPage.costTable.needProject'))
            return false
          }
          const payload = sortCostRowsByTypeMenu(
            rows.map((row) => ({
              ...row,
              applicable: viewApplicable,
            })),
          )
          const prevVersion = readCostPracticeVersion(workspaceId, practiceScopeId)
          writeCostPracticeCatalog(workspaceId, practiceScopeId, payload)
          recordCostPracticeSaveMeta(workspaceId, practiceScopeId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          applyCatalogRows(payload, { dirty: false })
          const nextVersion = readCostPracticeVersion(workspaceId, practiceScopeId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccess'),
            })
          }
          return true
        }
        if (isAllScope) {
          const payload = sortCostRowsByTypeMenu(
            rows.map((row) => ({
              ...row,
              applicable: PM_COST_APPLICABLE_ALL,
            })),
          )
          const prevVersion = readSharedCostVersion(workspaceId)
          writeSharedCostCatalog(workspaceId, payload)
          recordSharedCostSaveMeta(workspaceId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          applyCatalogRows(payload, { dirty: false })
          await onProjectsChange?.()
          const nextVersion = readSharedCostVersion(workspaceId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccess'),
            })
          }
          return true
        }
        if (!editingProject) {
          window.alert(t('projectManagerPage.costTable.needProject'))
          return false
        }

        const sharedRows = readSharedCostCatalog(workspaceId).rows
        const baseline = buildBaselinePriceIndex(sharedRows)
        const payload = sortCostRowsLikeSharedCatalog(
          withDerivedCostApplicable(rows.map((row) => ({ ...row })), baseline, editingProject.id),
          sharedRows,
        )

        // Project save does not sync into「全部项目」shared catalog.
        const { prevVersion, nextVersion } = await persistProjectCatalog(
          editingProject,
          payload,
          { bumpVersion: asNewVersion, note },
        )
        applyCatalogRows(payload, { dirty: false })
        await onProjectsChange?.()
        if (nextVersion > prevVersion) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.costTable.saveSuccessNewVersion', {
              version: String(nextVersion),
            }),
          })
        } else if (nextVersion > 0) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.costTable.saveSuccessUpdated', {
              version: String(nextVersion),
            }),
          })
        } else {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.costTable.saveSuccess'),
          })
        }
        return true
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err))
        return false
      } finally {
        setSaving(false)
      }
    },
    [
      applyCatalogRows,
      canEdit,
      editingProject,
      isAllScope,
      isPractice,
      onProjectsChange,
      persistProjectCatalog,
      practiceScopeId,
      rows,
      setStatusFeedback,
      t,
      viewApplicable,
      workspaceId,
    ],
  )

  const flushAutoSave = useCallback(async () => {
    if (!canEdit) return
    const catalog = rowsRef.current
    try {
      if (isPractice) {
        if (!practiceScopeId) return
        const payload = sortCostRowsByTypeMenu(
          catalog.map((row) => ({
            ...row,
            applicable: viewApplicable,
          })),
        )
        writeCostPracticeCatalog(workspaceId, practiceScopeId, payload)
        recordCostPracticeSaveMeta(workspaceId, practiceScopeId, payload, { bumpVersion: false })
        cleanFingerprintRef.current = fingerprintCostCatalog(payload)
        return
      }
      if (isAllScope) {
        const payload = sortCostRowsByTypeMenu(
          catalog.map((row) => ({
            ...row,
            applicable: PM_COST_APPLICABLE_ALL,
          })),
        )
        writeSharedCostCatalog(workspaceId, payload)
        recordSharedCostSaveMeta(workspaceId, payload, { bumpVersion: false })
        cleanFingerprintRef.current = fingerprintCostCatalog(payload)
        return
      }
      if (!editingProject) return
      const sharedRows = readSharedCostCatalog(workspaceId).rows
      const baseline = buildBaselinePriceIndex(sharedRows)
      const payload = sortCostRowsLikeSharedCatalog(
        withDerivedCostApplicable(
          catalog.map((row) => ({ ...row })),
          baseline,
          editingProject.id,
        ),
        sharedRows,
      )
      await persistProjectCatalog(editingProject, payload, { bumpVersion: false })
      cleanFingerprintRef.current = fingerprintCostCatalog(payload)
    } catch {
      // Best-effort leave save.
    }
  }, [
    canEdit,
    editingProject,
    isAllScope,
    isPractice,
    persistProjectCatalog,
    practiceScopeId,
    viewApplicable,
    workspaceId,
  ])

  usePmCatalogAutoSave({ scopeKey, dirty, flush: flushAutoSave })

  return { persistProjectCatalog, handleSave, flushAutoSave }
}
