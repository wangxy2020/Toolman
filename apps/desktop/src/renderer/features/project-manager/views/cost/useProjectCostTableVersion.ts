import { useCallback, useMemo } from 'react'

import type { PmProject } from '@toolman/shared'
import {
  buildMetadataForCostVersionSwitch,
  readCostSaveHistory,
  readCostVersion,
  readCostVersionCatalog,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import {
  PM_COST_CATALOG_KEY,
  readSharedCostSaveHistory,
  readSharedCostSaveMeta,
  readSharedCostVersion,
  sortCostRowsByTypeMenu,
  writeSharedCostCatalog,
  writeSharedCostSaveMeta,
  type PmCostRow,
} from './pm-cost-catalog'
import {
  readCostPracticeSaveHistory,
  readCostPracticeSaveMeta,
  readCostPracticeVersion,
  writeCostPracticeCatalog,
  writeCostPracticeSaveMeta,
} from './pm-cost-practice-catalog'
import { snapshotToRows } from './pm-cost-panel-utils'
import type { CostVersionSwitchEntry } from './ProjectCostMenuBar'

export function useProjectCostTableVersion(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  practiceScopeId: string
  editingProject: PmProject | null
  dirty: boolean
  rows: PmCostRow[]
  pendingRestoreVersion: number | null
  setPendingRestoreVersion: (v: number | null) => void
  setSaving: (v: boolean) => void
  setSelectedId: (v: string | null) => void
  applyCatalogRows: (catalog: PmCostRow[], options?: { dirty?: boolean; clearHistory?: boolean }) => void
  onProjectsChange?: () => void | Promise<void>
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, isAllScope, practiceScopeId, editingProject, dirty, rows,
    pendingRestoreVersion, setPendingRestoreVersion, setSaving, setSelectedId, applyCatalogRows,
    onProjectsChange, t,
  } = args

  const versionSwitchEntries = useMemo((): CostVersionSwitchEntry[] => {
    if (isPractice) {
      if (!practiceScopeId) return []
      const history = readCostPracticeSaveHistory(workspaceId, practiceScopeId)
      const currentVersion = readCostPracticeVersion(workspaceId, practiceScopeId)
      return history.map((entry) => ({
        version: entry.version,
        name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
          version: String(entry.version),
        }),
        hasSnapshot: Array.isArray(entry.catalog),
        isCurrent: entry.version === currentVersion,
      }))
    }
    const history = isAllScope
      ? readSharedCostSaveHistory(workspaceId)
      : readCostSaveHistory(editingProject?.metadata)
    const currentVersion = isAllScope
      ? readSharedCostVersion(workspaceId)
      : readCostVersion(editingProject?.metadata)
    return history.map((entry) => ({
      version: entry.version,
      name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
        version: String(entry.version),
      }),
      hasSnapshot: Array.isArray(entry.catalog),
      isCurrent: entry.version === currentVersion,
    }))
  }, [
    dirty,
    editingProject?.metadata,
    isAllScope,
    isPractice,
    practiceScopeId,
    rows,
    t,
    workspaceId,
  ])

  const handleConfirmRestoreVersion = useCallback(async () => {
    if (pendingRestoreVersion == null) return
    const version = pendingRestoreVersion
    setPendingRestoreVersion(null)
    setSaving(true)
    try {
      if (isPractice) {
        if (!practiceScopeId) return
        const meta = readCostPracticeSaveMeta(workspaceId, practiceScopeId)
        const catalog = readCostVersionCatalog(meta, version)
        const nextMeta = buildMetadataForCostVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.costTable.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = sortCostRowsByTypeMenu(snapshotToRows(catalog))
        writeCostPracticeCatalog(workspaceId, practiceScopeId, rowsNext)
        writeCostPracticeSaveMeta(workspaceId, practiceScopeId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
        setSelectedId(null)
        window.alert(
          t('projectManagerPage.costTable.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (isAllScope) {
        const meta = readSharedCostSaveMeta(workspaceId)
        const catalog = readCostVersionCatalog(meta, version)
        const nextMeta = buildMetadataForCostVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.costTable.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = sortCostRowsByTypeMenu(snapshotToRows(catalog))
        writeSharedCostCatalog(workspaceId, rowsNext)
        writeSharedCostSaveMeta(workspaceId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
        setSelectedId(null)
        await onProjectsChange?.()
        window.alert(
          t('projectManagerPage.costTable.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (!editingProject) return
      const catalog = readCostVersionCatalog(editingProject.metadata, version)
      const nextMeta = buildMetadataForCostVersionSwitch(editingProject.metadata, version)
      if (!catalog || !nextMeta) {
        window.alert(t('projectManagerPage.costTable.versionSwitchNoSnapshot'))
        return
      }
      const rowsNext = sortCostRowsByTypeMenu(snapshotToRows(catalog))
      await pmApi.updateProject({
        id: editingProject.id,
        metadata: {
          ...nextMeta,
          [PM_COST_CATALOG_KEY]: rowsNext,
        },
      })
      applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
      setSelectedId(null)
      await onProjectsChange?.()
      window.alert(
        t('projectManagerPage.costTable.restoreVersionSuccess', {
          name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
            version: String(version),
          }),
        }),
      )
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    applyCatalogRows,
    editingProject,
    isAllScope,
    isPractice,
    onProjectsChange,
    pendingRestoreVersion,
    practiceScopeId,
    t,
    workspaceId,
  ])

  const handleRestoreVersion = useCallback(
    (version: number) => {
      const currentVersion = isPractice
        ? practiceScopeId
          ? readCostPracticeVersion(workspaceId, practiceScopeId)
          : 0
        : isAllScope
          ? readSharedCostVersion(workspaceId)
          : readCostVersion(editingProject?.metadata)
      if (version === currentVersion) return
      setPendingRestoreVersion(version)
    },
    [editingProject?.metadata, isAllScope, isPractice, practiceScopeId, workspaceId],
  )

  return { versionSwitchEntries, handleConfirmRestoreVersion, handleRestoreVersion }
}
