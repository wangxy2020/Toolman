import { useCallback, useMemo } from 'react'
import type { PmProject } from '@toolman/shared'
import {
  buildMetadataForFeatureVersionSwitch,
  readFeatureSaveHistory,
  readFeatureVersion,
  readFeatureVersionCatalog,
} from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import {
  PM_FEATURE_CATALOG_KEY,
  readSharedFeatureSaveHistory,
  readSharedFeatureSaveMeta,
  readSharedFeatureVersion,
  writeSharedFeatureCatalog,
  writeSharedFeatureSaveMeta,
  type PmFeatureRow,
} from './pm-features-catalog'
import { snapshotToRows } from './pm-features-panel-utils'
import type { FeaturesVersionSwitchEntry } from './ProjectFeaturesMenuBar'

export function useProjectManagementFilesVersion(args: {
  workspaceId: string
  isAllScope: boolean
  editingProject: PmProject | null
  dirty: boolean
  rows: PmFeatureRow[]
  pendingRestoreVersion: number | null
  setPendingRestoreVersion: (v: number | null) => void
  setSaving: (v: boolean) => void
  setSelectedId: (v: string | null) => void
  applyCatalogRows: (persisted: PmFeatureRow[], options?: { dirty?: boolean }) => void
  onProjectsChange?: () => void
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isAllScope, editingProject, dirty, rows, pendingRestoreVersion,
    setPendingRestoreVersion, setSaving, setSelectedId, applyCatalogRows, onProjectsChange, t,
  } = args

  const versionSwitchEntries = useMemo((): FeaturesVersionSwitchEntry[] => {
    const history = isAllScope
      ? readSharedFeatureSaveHistory(workspaceId)
      : readFeatureSaveHistory(editingProject?.metadata)
    const currentVersion = isAllScope
      ? readSharedFeatureVersion(workspaceId)
      : readFeatureVersion(editingProject?.metadata)
    return history.map((entry) => ({
      version: entry.version,
      name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
        version: String(entry.version),
      }),
      hasSnapshot: Array.isArray(entry.catalog),
      isCurrent: entry.version === currentVersion,
    }))
  }, [dirty, editingProject?.metadata, isAllScope, rows, t, workspaceId])

  const handleConfirmRestoreVersion = useCallback(async () => {
    if (pendingRestoreVersion == null) return
    const version = pendingRestoreVersion
    setPendingRestoreVersion(null)
    setSaving(true)
    try {
      if (isAllScope) {
        const meta = readSharedFeatureSaveMeta(workspaceId)
        const catalog = readFeatureVersionCatalog(meta, version)
        const nextMeta = buildMetadataForFeatureVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.files.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = snapshotToRows(catalog)
        writeSharedFeatureCatalog(workspaceId, rowsNext)
        writeSharedFeatureSaveMeta(workspaceId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false })
        setSelectedId(null)
        await onProjectsChange?.()
        window.alert(
          t('projectManagerPage.files.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (!editingProject) return
      const catalog = readFeatureVersionCatalog(editingProject.metadata, version)
      const nextMeta = buildMetadataForFeatureVersionSwitch(editingProject.metadata, version)
      if (!catalog || !nextMeta) {
        window.alert(t('projectManagerPage.files.versionSwitchNoSnapshot'))
        return
      }
      const rowsNext = snapshotToRows(catalog)
      await pmApi.updateProject({
        id: editingProject.id,
        metadata: {
          ...nextMeta,
          [PM_FEATURE_CATALOG_KEY]: rowsNext,
        },
      })
      applyCatalogRows(rowsNext, { dirty: false })
      setSelectedId(null)
      await onProjectsChange?.()
      window.alert(
        t('projectManagerPage.files.restoreVersionSuccess', {
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
    onProjectsChange,
    pendingRestoreVersion,
    t,
    workspaceId,
  ])

  const handleRestoreVersion = useCallback(
    (version: number) => {
      const currentVersion = isAllScope
        ? readSharedFeatureVersion(workspaceId)
        : readFeatureVersion(editingProject?.metadata)
      if (version === currentVersion) return
      setPendingRestoreVersion(version)
    },
    [editingProject?.metadata, isAllScope, workspaceId],
  )

  return { versionSwitchEntries, handleConfirmRestoreVersion, handleRestoreVersion }
}
