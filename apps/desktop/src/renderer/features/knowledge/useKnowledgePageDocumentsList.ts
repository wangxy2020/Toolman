import { useMemo } from 'react'
import { knowledgeDocumentToPanelItem } from './KnowledgeBaseFilePanel'
import { formatKnowledgeIngestStatusBarMessage } from './knowledge-file-display'
import { sortKnowledgeFilePanelItems } from './knowledge-file-sort'
import { useKnowledgeDocuments } from './useKnowledgeDocuments'
import {
  SYSTEM_DEFAULT_FOLDER_KB_NAMES,
} from './knowledge-sidebar-types'
import type { KnowledgePageProps } from './knowledge-page-types'
import type { UseKnowledgePageStateResult } from './useKnowledgePageState'

export function useKnowledgePageDocumentsList(
  {
    workspaceId,
    knowledgeItems,
  }: Pick<KnowledgePageProps, 'workspaceId' | 'knowledgeItems'>,
  state: Pick<
    UseKnowledgePageStateResult,
    | 't'
    | 'sortField'
    | 'sortAscending'
    | 'dedupScanState'
    | 'isFileDedupView'
    | 'showingDefaultSyncFolder'
    | 'syncDefaultKb'
    | 'importTarget'
    | 'defaultFolderInitializing'
  >,
) {
  const {
    t,
    sortField,
    sortAscending,
    dedupScanState,
    isFileDedupView,
    showingDefaultSyncFolder,
    syncDefaultKb,
    importTarget,
    defaultFolderInitializing,
  } = state

  const documents = useKnowledgeDocuments(workspaceId, importTarget.kbId)

  const syncMoveTargets = useMemo(
    () =>
      (knowledgeItems ?? []).filter(
        (item) =>
          item.kind === 'sync' &&
          !SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(item.name) &&
          item.id !== importTarget.kbId,
      ),
    [knowledgeItems, importTarget.kbId],
  )

  const showDefaultSyncTarget = !(
    showingDefaultSyncFolder ||
    (syncDefaultKb.kbId != null && syncDefaultKb.kbId === importTarget.kbId)
  )

  const panelDocuments = useMemo(() => {
    const items = documents.items.map((doc) => ({
      ...knowledgeDocumentToPanelItem(doc),
      ingestProgress: documents.ingestProgressById[doc.id] ?? null,
      ingestDetail: documents.ingestDetailById[doc.id] ?? null,
    }))
    return sortKnowledgeFilePanelItems(items, sortField, sortAscending)
  }, [
    documents.ingestDetailById,
    documents.ingestProgressById,
    documents.items,
    sortField,
    sortAscending,
  ])

  const panelLoading =
    defaultFolderInitializing || (documents.loading && Boolean(importTarget.kbId))

  const statusBar = useMemo(() => {
    if (documents.ingesting) {
      const formatted = formatKnowledgeIngestStatusBarMessage({
        items: documents.items,
        progressById: documents.ingestProgressById,
        detailById: documents.ingestDetailById,
        t,
      })
      return {
        priority: {
          tone: 'info' as const,
          text: formatted?.text ?? t('knowledgePage.importing'),
        },
        fallback: {
          tone: 'info' as const,
          text: formatted?.text ?? t('knowledgePage.importing'),
        },
        meta: formatted?.meta ?? null,
      }
    }
    if (panelLoading) {
      return {
        priority: null,
        fallback: { tone: 'info' as const, text: t('common.loading') },
        meta: null,
      }
    }
    if (isFileDedupView && dedupScanState.scanning) {
      const progress = dedupScanState.progress
      const text =
        progress && progress.total > 0
          ? `${t('knowledgePage.scanningDuplicates')} ${progress.scanned}/${progress.total}`
          : t('knowledgePage.scanningDuplicates')
      return {
        priority: null,
        fallback: { tone: 'info' as const, text },
        meta: null,
      }
    }
    return {
      priority: null,
      fallback: { tone: 'muted' as const, text: t('knowledgePage.ready') },
      meta: null,
    }
  }, [
    dedupScanState.progress,
    dedupScanState.scanning,
    documents.ingestDetailById,
    documents.ingestProgressById,
    documents.ingesting,
    documents.items,
    isFileDedupView,
    panelLoading,
    t,
  ])

  return {
    documents,
    panelDocuments,
    panelLoading,
    statusFallback: statusBar.fallback,
    statusPriority: statusBar.priority,
    statusMeta: statusBar.meta,
    syncMoveTargets,
    showDefaultSyncTarget,
  }
}
