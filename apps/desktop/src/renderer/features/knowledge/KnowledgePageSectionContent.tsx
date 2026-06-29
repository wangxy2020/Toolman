import { translateKnowledgeFolderName } from '../../i18n/system-labels'
import { KnowledgeBaseFilePanel } from './KnowledgeBaseFilePanel'
import type { UseKnowledgePageResult } from './useKnowledgePage'

type KnowledgePageSectionContentProps = Pick<
  UseKnowledgePageResult,
  | 't'
  | 'section'
  | 'active'
  | 'loading'
  | 'showingDefaultFolder'
  | 'showingDefaultNetworkFolder'
  | 'showingDefaultLocalFilesFolder'
  | 'panelDocuments'
  | 'panelLoading'
  | 'importTarget'
  | 'importReady'
  | 'isNetworkKbView'
  | 'selectedIds'
  | 'documents'
  | 'handleToggleSelect'
  | 'handleImportFiles'
  | 'handleDeleteDocument'
  | 'handleContextMenu'
  | 'onKbChanged'
> & {
  onOpenNote?: (noteId: string) => boolean
  onOpenAddUrl: () => void
  onAddUrl: (url: string) => void
}

export function KnowledgePageSectionContent({
  t,
  section,
  active,
  loading,
  showingDefaultFolder,
  showingDefaultNetworkFolder,
  showingDefaultLocalFilesFolder,
  panelDocuments,
  panelLoading,
  importTarget,
  importReady,
  isNetworkKbView,
  selectedIds,
  documents,
  handleToggleSelect,
  handleImportFiles,
  handleDeleteDocument,
  handleContextMenu,
  onKbChanged,
  onOpenNote,
  onOpenAddUrl,
  onAddUrl,
}: KnowledgePageSectionContentProps) {
  const renderKnowledgeFilePanel = () => (
    <KnowledgeBaseFilePanel
      documents={panelDocuments}
      loading={Boolean(panelLoading && documents.items.length === 0)}
      ingesting={importTarget.vectorized && documents.ingesting}
      showIndexActions={importTarget.vectorized}
      mode={isNetworkKbView ? 'url' : 'file'}
      importDisabled={!importReady}
      defaultImportPath={importTarget.defaultImportPath}
      selectedIds={selectedIds}
      onToggleSelect={handleToggleSelect}
      onImportFiles={(paths) => void handleImportFiles(paths)}
      onImportError={(message) => documents.setError(message)}
      onOpenAddUrl={onOpenAddUrl}
      onAddUrl={(url) => void onAddUrl(url)}
      onReindexDocument={(id) => void documents.reindex(id).then(() => onKbChanged?.())}
      onCancelIngestDocument={(id) => void documents.cancelIngest(id).then(() => onKbChanged?.())}
      onDeleteDocument={(id) => void handleDeleteDocument(id)}
      onOpenNote={onOpenNote}
      onContextMenu={handleContextMenu}
    />
  )

  if (section === 'local' || section === 'network' || section === 'local-files') {
    if (
      !showingDefaultFolder &&
      !showingDefaultNetworkFolder &&
      !showingDefaultLocalFilesFolder &&
      !active &&
      !loading
    ) {
      return (
        <KnowledgeBaseFilePanel
          documents={[]}
          onImportFiles={() => {}}
          importDisabled
        />
      )
    }

    if (
      active &&
      section === 'local' &&
      active.kind !== 'local' &&
      !showingDefaultFolder
    ) {
      return (
        <div className="tm-module-empty">
          <h2 className="tm-module-empty-title">{t('knowledgePage.sections.local')}</h2>
          <p className="tm-module-empty-hint">
            {t('knowledgePage.wrongSection', {
              name: translateKnowledgeFolderName(active.name, t),
              section: t('knowledgePage.sections.local'),
            })}
          </p>
        </div>
      )
    }

    if (
      active &&
      section === 'network' &&
      active.kind !== 'network' &&
      !showingDefaultNetworkFolder
    ) {
      return (
        <div className="tm-module-empty">
          <h2 className="tm-module-empty-title">{t('knowledgePage.sections.network')}</h2>
          <p className="tm-module-empty-hint">
            {t('knowledgePage.wrongSection', {
              name: translateKnowledgeFolderName(active.name, t),
              section: t('knowledgePage.sections.network'),
            })}
          </p>
        </div>
      )
    }

    if (
      active &&
      section === 'local-files' &&
      active.kind !== 'local_files' &&
      !showingDefaultLocalFilesFolder
    ) {
      return (
        <div className="tm-module-empty">
          <h2 className="tm-module-empty-title">{t('knowledgePage.sections.localFiles')}</h2>
          <p className="tm-module-empty-hint">
            {t('knowledgePage.wrongSection', {
              name: translateKnowledgeFolderName(active.name, t),
              section: t('knowledgePage.sections.localFiles'),
            })}
          </p>
        </div>
      )
    }

    return renderKnowledgeFilePanel()
  }

  return null
}

export function KnowledgePageSharedFilePanel({
  panelDocuments,
  panelLoading,
  importTarget,
  importReady,
  isNetworkKbView,
  selectedIds,
  documents,
  handleToggleSelect,
  handleImportFiles,
  handleDeleteDocument,
  handleContextMenu,
  onKbChanged,
  onOpenNote,
  onOpenAddUrl,
  onAddUrl,
}: Omit<KnowledgePageSectionContentProps, 't' | 'section' | 'active' | 'loading' | 'showingDefaultFolder' | 'showingDefaultNetworkFolder' | 'showingDefaultLocalFilesFolder'>) {
  return (
    <KnowledgeBaseFilePanel
      documents={panelDocuments}
      loading={Boolean(panelLoading && documents.items.length === 0)}
      ingesting={importTarget.vectorized && documents.ingesting}
      showIndexActions={importTarget.vectorized}
      mode={isNetworkKbView ? 'url' : 'file'}
      importDisabled={!importReady}
      defaultImportPath={importTarget.defaultImportPath}
      selectedIds={selectedIds}
      onToggleSelect={handleToggleSelect}
      onImportFiles={(paths) => void handleImportFiles(paths)}
      onImportError={(message) => documents.setError(message)}
      onOpenAddUrl={onOpenAddUrl}
      onAddUrl={(url) => void onAddUrl(url)}
      onReindexDocument={(id) => void documents.reindex(id).then(() => onKbChanged?.())}
      onCancelIngestDocument={(id) => void documents.cancelIngest(id).then(() => onKbChanged?.())}
      onDeleteDocument={(id) => void handleDeleteDocument(id)}
      onOpenNote={onOpenNote}
      onContextMenu={handleContextMenu}
    />
  )
}
