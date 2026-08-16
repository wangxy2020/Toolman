import { useCallback, type MutableRefObject } from 'react'
import type { PmProject } from '@toolman/shared'
import { buildResourceSaveMetadata, readResourceVersion } from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import { usePmCatalogAutoSave } from '../../usePmCatalogAutoSave'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import {
  PM_RESOURCE_APPLICABLE_ALL,
  PM_RESOURCE_CATALOG_KEY,
  buildBaselinePriceIndex,
  fingerprintResourceCatalog,
  readSharedResourceCatalog,
  readSharedResourceVersion,
  recordSharedResourceSaveMeta,
  sortResourceRowsByTypeMenu,
  sortResourceRowsLikeSharedCatalog,
  toResourceCatalogSnapshot,
  withDerivedResourceApplicable,
  writeSharedResourceCatalog,
  type PmResourceRow,
} from './pm-resource-catalog'
import {
  readPracticeVersion,
  recordPracticeSaveMeta,
  writePracticeCatalog,
} from './pm-resource-practice-catalog'

export function useProjectResourceTableSave(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  canEdit: boolean
  practiceScopeId: string
  scopeKey: string
  viewApplicable: string
  editingProject: PmProject | null
  rows: PmResourceRow[]
  rowsRef: MutableRefObject<PmResourceRow[]>
  dirty: boolean
  applyCatalogRows: (catalog: PmResourceRow[], options?: { dirty?: boolean; clearHistory?: boolean }) => void
  cleanFingerprintRef: MutableRefObject<string>
  onProjectsChange?: () => void | Promise<void>
  setSaving: (v: boolean) => void
  setStatusFeedback: ReturnType<typeof usePmStatusFeedback>[1]
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, isAllScope, canEdit, practiceScopeId, scopeKey, viewApplicable,
    editingProject, rows, rowsRef, dirty, applyCatalogRows, cleanFingerprintRef, onProjectsChange,
    setSaving, setStatusFeedback, t,
  } = args
  const persistProjectCatalog = useCallback(
    async (
      project: PmProject,
      catalog: PmResourceRow[],
      options?: { bumpVersion?: boolean; note?: string },
    ) => {
      const prevVersion = readResourceVersion(project.metadata)
      const metadata = {
        ...buildResourceSaveMetadata(project.metadata ?? {}, {
          resourceCount: catalog.length,
          contentFingerprint: fingerprintResourceCatalog(catalog),
          catalog: toResourceCatalogSnapshot(catalog),
          bumpVersion: options?.bumpVersion ?? false,
          ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
        }),
        [PM_RESOURCE_CATALOG_KEY]: catalog,
      }
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
      return {
        prevVersion,
        nextVersion: readResourceVersion(metadata),
      }
    },
    [],
  )

  // Projects without a saved catalog use「全部项目」live — do not auto-seed copies.

  const handleSave = useCallback(
    async (options?: { asNewVersion?: boolean; note?: string }): Promise<boolean> => {
      if (!canEdit) {
        window.alert(t('projectManagerPage.resourceTable.needProject'))
        return false
      }
      const asNewVersion = options?.asNewVersion === true
      const note = options?.note?.trim() || undefined
      setSaving(true)
      try {
        if (isPractice) {
          if (!practiceScopeId) {
            window.alert(t('projectManagerPage.resourceTable.needProject'))
            return false
          }
          const payload = sortResourceRowsByTypeMenu(
            rows.map((row) => ({
              ...row,
              applicable: viewApplicable,
            })),
          )
          const prevVersion = readPracticeVersion(workspaceId, practiceScopeId)
          writePracticeCatalog(workspaceId, practiceScopeId, payload)
          recordPracticeSaveMeta(workspaceId, practiceScopeId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          applyCatalogRows(payload, { dirty: false })
          const nextVersion = readPracticeVersion(workspaceId, practiceScopeId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccess'),
            })
          }
          return true
        }
        if (isAllScope) {
          const payload = sortResourceRowsByTypeMenu(
            rows.map((row) => ({
              ...row,
              applicable: PM_RESOURCE_APPLICABLE_ALL,
            })),
          )
          const prevVersion = readSharedResourceVersion(workspaceId)
          await writeSharedResourceCatalog(workspaceId, payload)
          recordSharedResourceSaveMeta(workspaceId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          applyCatalogRows(payload, { dirty: false })
          await onProjectsChange?.()
          const nextVersion = readSharedResourceVersion(workspaceId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccess'),
            })
          }
          return true
        }
        if (!editingProject) {
          window.alert(t('projectManagerPage.resourceTable.needProject'))
          return false
        }

        const sharedRows = readSharedResourceCatalog(workspaceId).rows
        const baseline = buildBaselinePriceIndex(sharedRows)
        const payload = sortResourceRowsLikeSharedCatalog(
          withDerivedResourceApplicable(
            rows.map((row) => ({ ...row })),
            baseline,
            editingProject.id,
          ),
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
            text: t('projectManagerPage.resourceTable.saveSuccessNewVersion', {
              version: String(nextVersion),
            }),
          })
        } else if (nextVersion > 0) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.resourceTable.saveSuccessUpdated', {
              version: String(nextVersion),
            }),
          })
        } else {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.resourceTable.saveSuccess'),
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
        const payload = sortResourceRowsByTypeMenu(
          catalog.map((row) => ({
            ...row,
            applicable: viewApplicable,
          })),
        )
        writePracticeCatalog(workspaceId, practiceScopeId, payload)
        recordPracticeSaveMeta(workspaceId, practiceScopeId, payload, { bumpVersion: false })
        cleanFingerprintRef.current = fingerprintResourceCatalog(payload)
        return
      }
      if (isAllScope) {
        const payload = sortResourceRowsByTypeMenu(
          catalog.map((row) => ({
            ...row,
            applicable: PM_RESOURCE_APPLICABLE_ALL,
          })),
        )
        writeSharedResourceCatalog(workspaceId, payload)
        recordSharedResourceSaveMeta(workspaceId, payload, { bumpVersion: false })
        cleanFingerprintRef.current = fingerprintResourceCatalog(payload)
        return
      }
      if (!editingProject) return
      const sharedRows = readSharedResourceCatalog(workspaceId).rows
      const baseline = buildBaselinePriceIndex(sharedRows)
      const payload = sortResourceRowsLikeSharedCatalog(
        withDerivedResourceApplicable(
          catalog.map((row) => ({ ...row })),
          baseline,
          editingProject.id,
        ),
        sharedRows,
      )
      await persistProjectCatalog(editingProject, payload, { bumpVersion: false })
      cleanFingerprintRef.current = fingerprintResourceCatalog(payload)
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
