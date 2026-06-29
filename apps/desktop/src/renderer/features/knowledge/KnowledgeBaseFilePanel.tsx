import { KnowledgeBaseFilePanelCard } from './KnowledgeBaseFilePanelCard'
import type { KnowledgeBaseFilePanelProps } from './knowledge-base-file-panel-types'
import { useKnowledgeBaseFilePanel } from './useKnowledgeBaseFilePanel'

export type { KnowledgeFilePanelItem } from './knowledge-base-file-panel-types'
export { knowledgeDocumentToPanelItem } from './knowledge-base-file-panel-utils'

export function KnowledgeBaseFilePanel({
  documents,
  loading,
  ingesting,
  importDisabled = false,
  hideDropzone = false,
  showIndexActions = false,
  defaultImportPath,
  mode = 'file',
  selectedIds,
  onToggleSelect,
  onImportFiles,
  onImportError,
  onOpenAddUrl,
  onAddUrl,
  onReindexDocument,
  onCancelIngestDocument,
  onDeleteDocument,
  onOpenNote,
  onOpenMarkdownFile,
  onContextMenu,
}: KnowledgeBaseFilePanelProps) {
  const panel = useKnowledgeBaseFilePanel({
    ingesting,
    importDisabled,
    defaultImportPath,
    mode,
    onImportFiles,
    onImportError,
    onOpenAddUrl,
    onAddUrl,
  })
  const { t, dragOver, dropzoneDisabled, isUrlMode, handlePickFiles, handleDrop, handleDragOver, handleDragLeave } =
    panel

  return (
    <div
      className={hideDropzone ? 'tm-kb-file-panel tm-kb-file-panel--list-only' : 'tm-kb-file-panel'}
      onDragEnter={hideDropzone ? undefined : handleDragOver}
      onDragOver={hideDropzone ? undefined : handleDragOver}
      onDragLeave={hideDropzone ? undefined : handleDragLeave}
      onDrop={hideDropzone ? undefined : handleDrop}
      onContextMenu={onContextMenu}
    >
      {!hideDropzone ? (
        <button
          type="button"
          className={[
            'tm-kb-file-dropzone',
            dragOver ? 'tm-kb-file-dropzone--active' : '',
            dropzoneDisabled ? 'tm-kb-file-dropzone--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={dropzoneDisabled}
          onClick={() => void handlePickFiles()}
        >
          <span className="tm-kb-file-dropzone-title">
            {isUrlMode ? t('knowledgePage.filePanel.dropTitleUrl') : t('knowledgePage.filePanel.dropTitleFile')}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            {isUrlMode ? t('knowledgePage.filePanel.dropHintUrl') : t('knowledgePage.filePanel.dropHintFile')}
          </span>
        </button>
      ) : null}

      {loading && documents.length === 0 ? (
        <p className="tm-kb-file-panel-empty">{t('knowledgePage.filePanel.loading')}</p>
      ) : null}

      {!loading && documents.length === 0 ? (
        <p className="tm-kb-file-panel-empty">
          {isUrlMode ? t('knowledgePage.filePanel.emptyUrls') : t('knowledgePage.filePanel.emptyFiles')}
        </p>
      ) : null}

      {documents.length > 0 ? (
        <ul className="tm-kb-file-list" onContextMenu={onContextMenu}>
          {documents.map((doc) => (
            <KnowledgeBaseFilePanelCard
              key={doc.id}
              doc={doc}
              isUrlMode={isUrlMode}
              showIndexActions={showIndexActions}
              ingesting={ingesting}
              selected={selectedIds?.has(doc.id) ?? false}
              selectionEnabled={Boolean(onToggleSelect)}
              onToggleSelect={onToggleSelect}
              onImportError={onImportError}
              onReindexDocument={onReindexDocument}
              onCancelIngestDocument={onCancelIngestDocument}
              onDeleteDocument={onDeleteDocument}
              onOpenNote={onOpenNote}
              onOpenMarkdownFile={onOpenMarkdownFile}
              onContextMenu={onContextMenu}
            />
          ))}
        </ul>
      ) : null}
    </div>
  )
}
