import { useCallback, useMemo } from 'react'
import type { PmProject } from '@toolman/shared'
import {
  buildMetadataForResourceVersionSwitch,
  readResourceSaveHistory,
  readResourceVersion,
  readResourceVersionCatalog,
} from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import {
  PM_RESOURCE_CATALOG_KEY,
  readSharedResourceSaveHistory,
  readSharedResourceSaveMeta,
  readSharedResourceVersion,
  sortResourceRowsByTypeMenu,
  writeSharedResourceCatalog,
  writeSharedResourceSaveMeta,
  type PmResourceRow,
} from './pm-resource-catalog'
import {
  readPracticeSaveHistory,
  readPracticeSaveMeta,
  readPracticeVersion,
  writePracticeCatalog,
  writePracticeSaveMeta,
} from './pm-resource-practice-catalog'
import { snapshotToRows } from './pm-resource-panel-utils'
import type { ResourceVersionSwitchEntry } from './ProjectResourceMenuBar'

export function useProjectResourceTableVersion(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  practiceScopeId: string
  editingProject: PmProject | null
  dirty: boolean
  rows: PmResourceRow[]
  pendingRestoreVersion: number | null
  setPendingRestoreVersion: (v: number | null) => void
  setSaving: (v: boolean) => void
  setSelectedId: (v: string | null) => void
  applyCatalogRows: (catalog: PmResourceRow[], options?: { dirty?: boolean; clearHistory?: boolean }) => void
  onProjectsChange?: () => void | Promise<void>
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, isAllScope, practiceScopeId, editingProject, dirty, rows,
    pendingRestoreVersion, setPendingRestoreVersion, setSaving, setSelectedId, applyCatalogRows,
    onProjectsChange, t,
  } = args

  const versionSwitchEntries = useMemo((): ResourceVersionSwitchEntry[] => {
    if (isPractice) {
      if (!practiceScopeId) return []
      const history = readPracticeSaveHistory(workspaceId, practiceScopeId)
      const currentVersion = readPracticeVersion(workspaceId, practiceScopeId)
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
      ? readSharedResourceSaveHistory(workspaceId)
      : readResourceSaveHistory(editingProject?.metadata)
    const currentVersion = isAllScope
      ? readSharedResourceVersion(workspaceId)
      : readResourceVersion(editingProject?.metadata)
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
        const meta = readPracticeSaveMeta(workspaceId, practiceScopeId)
        const catalog = readResourceVersionCatalog(meta, version)
        const nextMeta = buildMetadataForResourceVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.resourceTable.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog, isPractice))
        writePracticeCatalog(workspaceId, practiceScopeId, rowsNext)
        writePracticeSaveMeta(workspaceId, practiceScopeId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
        setSelectedId(null)
        window.alert(
          t('projectManagerPage.resourceTable.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (isAllScope) {
        const meta = readSharedResourceSaveMeta(workspaceId)
        const catalog = readResourceVersionCatalog(meta, version)
        const nextMeta = buildMetadataForResourceVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.resourceTable.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog, isPractice))
        writeSharedResourceCatalog(workspaceId, rowsNext)
        writeSharedResourceSaveMeta(workspaceId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
        setSelectedId(null)
        await onProjectsChange?.()
        window.alert(
          t('projectManagerPage.resourceTable.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (!editingProject) return
      const catalog = readResourceVersionCatalog(editingProject.metadata, version)
      const nextMeta = buildMetadataForResourceVersionSwitch(
        editingProject.metadata,
        version,
      )
      if (!catalog || !nextMeta) {
        window.alert(t('projectManagerPage.resourceTable.versionSwitchNoSnapshot'))
        return
      }
      const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog, isPractice))
      await pmApi.updateProject({
        id: editingProject.id,
        metadata: {
          ...nextMeta,
          [PM_RESOURCE_CATALOG_KEY]: rowsNext,
        },
      })
      applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
      setSelectedId(null)
      await onProjectsChange?.()
      window.alert(
        t('projectManagerPage.resourceTable.restoreVersionSuccess', {
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
          ? readPracticeVersion(workspaceId, practiceScopeId)
          : 0
        : isAllScope
          ? readSharedResourceVersion(workspaceId)
          : readResourceVersion(editingProject?.metadata)
      if (version === currentVersion) return
      setPendingRestoreVersion(version)
    },
    [editingProject?.metadata, isAllScope, isPractice, practiceScopeId, workspaceId],
  )

  return { versionSwitchEntries, handleConfirmRestoreVersion, handleRestoreVersion }
}
