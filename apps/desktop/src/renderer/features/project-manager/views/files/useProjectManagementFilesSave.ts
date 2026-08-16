import { useCallback, useEffect } from 'react'
import type { PmProject } from '@toolman/shared'
import { buildFeatureSaveMetadata, readFeatureVersion } from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import { usePmCatalogAutoSave } from '../../usePmCatalogAutoSave'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import {
  fingerprintFeatureCatalog,
  PM_FEATURE_APPLICABLE_ALL,
  PM_FEATURE_CATALOG_KEY,
  persistFeatureCatalogRows,
  readSharedFeatureVersion,
  recordSharedFeatureSaveMeta,
  resolveProjectFeatureCatalog,
  toFeatureCatalogSnapshot,
  writeSharedFeatureCatalog,
  type PmFeatureRow,
} from './pm-features-catalog'

export function useProjectManagementFilesSave(args: {
  workspaceId: string
  isAllScope: boolean
  canEdit: boolean
  scopeKey: string
  editingProject: PmProject | null
  projects: PmProject[]
  dirty: boolean
  rows: PmFeatureRow[]
  rowsRef: { current: PmFeatureRow[] }
  applyCatalogRows: (persisted: PmFeatureRow[], options?: { dirty?: boolean }) => void
  onProjectsChange?: () => void
  setSaving: (v: boolean) => void
  setDirty: (v: boolean) => void
  setStatusFeedback: ReturnType<typeof usePmStatusFeedback>[1]
  setSelectedId: (v: string | null) => void
  setCheckedIds: (v: Set<string>) => void
  setSelectionMode: (v: boolean) => void
  setContextMenu: (v: null) => void
  setColumnMenu: (v: null) => void
  setProjectInfoOpen: (v: boolean) => void
  setPendingRestoreVersion: (v: number | null) => void
  setMatrixLayout: (v: 'horizontal' | 'vertical') => void
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isAllScope, canEdit, scopeKey, editingProject, projects, dirty, rows, rowsRef,
    applyCatalogRows, onProjectsChange, setSaving, setDirty, setStatusFeedback, setSelectedId, setCheckedIds,
    setSelectionMode, setContextMenu, setColumnMenu, setProjectInfoOpen, setPendingRestoreVersion,
    setMatrixLayout, t,
  } = args

  const persistProjectCatalog = useCallback(
    async (
      project: PmProject,
      catalog: PmFeatureRow[],
      options?: { bumpVersion?: boolean; note?: string },
    ) => {
      const prevVersion = readFeatureVersion(project.metadata)
      const metadata = {
        ...buildFeatureSaveMetadata(project.metadata ?? {}, {
          featureCount: catalog.length,
          contentFingerprint: fingerprintFeatureCatalog(catalog),
          catalog: toFeatureCatalogSnapshot(catalog),
          bumpVersion: options?.bumpVersion ?? false,
          ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
        }),
        [PM_FEATURE_CATALOG_KEY]: catalog,
      }
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
      return {
        prevVersion,
        nextVersion: readFeatureVersion(metadata),
      }
    },
    [],
  )

  const propagateSharedToProjects = useCallback(
    async (exceptProjectId?: string | null) => {
      for (const project of projects) {
        if (exceptProjectId && project.id === exceptProjectId) continue
        const resolved = resolveProjectFeatureCatalog(
          workspaceId,
          project.id,
          project.metadata,
        )
        if (!resolved.needsPersist) continue
        // Propagate catalog rows only — do not bump per-project feature versions.
        await pmApi.updateProject({
          id: project.id,
          metadata: { [PM_FEATURE_CATALOG_KEY]: resolved.rows },
        })
      }
    },
    [projects, workspaceId],
  )

  const handleSave = useCallback(
    async (options?: { asNewVersion?: boolean; note?: string }): Promise<boolean> => {
      if (!canEdit) {
        window.alert(t('projectManagerPage.files.table.needProject'))
        return false
      }
      const asNewVersion = options?.asNewVersion === true
      const note = options?.note?.trim() || undefined
      setSaving(true)
      try {
        // labor / auxiliary / material / machinery / funds / Gantt materials are live — never persist them raw.
        const persisted = persistFeatureCatalogRows(rows)

        if (isAllScope) {
          const payload = persisted.map((row) => ({
            ...row,
            applicable: PM_FEATURE_APPLICABLE_ALL,
          }))
          const prevVersion = readSharedFeatureVersion(workspaceId)
          writeSharedFeatureCatalog(workspaceId, payload)
          recordSharedFeatureSaveMeta(workspaceId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          await propagateSharedToProjects()
          applyCatalogRows(payload, { dirty: false })
          await onProjectsChange?.()
          const nextVersion = readSharedFeatureVersion(workspaceId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.files.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.files.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.files.table.saveSuccess'),
            })
          }
          return true
        }
        if (!editingProject) {
          window.alert(t('projectManagerPage.files.table.needProject'))
          return false
        }

        const payload = persisted.map((row) => ({
          ...row,
          applicable:
            row.applicable === PM_FEATURE_APPLICABLE_ALL
              ? PM_FEATURE_APPLICABLE_ALL
              : editingProject.id,
        }))

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
            text: t('projectManagerPage.files.saveSuccessNewVersion', {
              version: String(nextVersion),
            }),
          })
        } else if (nextVersion > 0) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.files.saveSuccessUpdated', {
              version: String(nextVersion),
            }),
          })
        } else {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.files.table.saveSuccess'),
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
      onProjectsChange,
      persistProjectCatalog,
      propagateSharedToProjects,
      rows,
      setStatusFeedback,
      t,
      workspaceId,
    ],
  )

  const flushAutoSave = useCallback(async () => {
    if (!canEdit) return
    const catalog = rowsRef.current
    try {
      const persisted = persistFeatureCatalogRows(catalog)
      if (isAllScope) {
        const payload = persisted.map((row) => ({
          ...row,
          applicable: PM_FEATURE_APPLICABLE_ALL,
        }))
        writeSharedFeatureCatalog(workspaceId, payload)
        recordSharedFeatureSaveMeta(workspaceId, payload, { bumpVersion: false })
        await propagateSharedToProjects()
        await onProjectsChange?.()
        return
      }
      if (!editingProject) return
      const payload = persisted.map((row) => ({
        ...row,
        applicable:
          row.applicable === PM_FEATURE_APPLICABLE_ALL
            ? PM_FEATURE_APPLICABLE_ALL
            : editingProject.id,
      }))
      await persistProjectCatalog(editingProject, payload, { bumpVersion: false })
      // Refresh parent projects so remount (e.g. leave 计量 → re-enter) does not hydrate
      // from stale metadata and drop the rows we just wrote.
      await onProjectsChange?.()
    } catch {
      // Best-effort leave save.
    }
  }, [
    canEdit,
    editingProject,
    isAllScope,
    onProjectsChange,
    persistProjectCatalog,
    propagateSharedToProjects,
    workspaceId,
  ])

  usePmCatalogAutoSave({ scopeKey, dirty, flush: flushAutoSave })

  useEffect(() => {
    setDirty(false)
    setSelectedId(null)
    setCheckedIds(new Set())
    setSelectionMode(false)
    setContextMenu(null)
    setColumnMenu(null)
    setProjectInfoOpen(false)
    setPendingRestoreVersion(null)
    setMatrixLayout('horizontal')
  }, [scopeKey])

  return { persistProjectCatalog, handleSave, flushAutoSave }
}
