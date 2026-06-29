import { IconCheck, IconFile, IconGlobe, IconRefresh, IconTrash, IconX } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  formatKnowledgeDocTime,
  formatKnowledgeFileSize,
  getKnowledgeDocExtension,
  getKnowledgeDocStatusLabel,
  isKnowledgeDocProcessing,
  isMarkdownKnowledgeDocument,
} from './knowledge-file-display'
import { resolveNoteIdFromKnowledgeDocument } from './knowledge-note-link'
import type { KnowledgeFilePanelItem } from './knowledge-base-file-panel-types'
import {
  isOpenableLocalPath,
  openExternalUrl,
  openLocalFile,
} from './knowledge-base-file-panel-utils'
import { KnowledgeBaseFilePanelSelectCheckbox } from './KnowledgeBaseFilePanelSelectCheckbox'

interface CardProps {
  doc: KnowledgeFilePanelItem
  isUrlMode: boolean
  showIndexActions: boolean
  ingesting?: boolean
  selected: boolean
  selectionEnabled: boolean
  onToggleSelect?: (id: string) => void
  onImportError?: (message: string) => void
  onReindexDocument?: (id: string) => void
  onCancelIngestDocument?: (id: string) => void
  onDeleteDocument?: (id: string) => void
  onOpenNote?: (noteId: string) => boolean
  onOpenMarkdownFile?: (doc: KnowledgeFilePanelItem) => boolean | void
  onContextMenu?: (event: React.MouseEvent, documentId?: string) => void
}

export function KnowledgeBaseFilePanelCard({
  doc,
  isUrlMode,
  showIndexActions,
  ingesting,
  selected,
  selectionEnabled,
  onToggleSelect,
  onImportError,
  onReindexDocument,
  onCancelIngestDocument,
  onDeleteDocument,
  onOpenNote,
  onOpenMarkdownFile,
  onContextMenu,
}: CardProps) {
  const { t } = useI18n()
  const extension = getKnowledgeDocExtension(doc.title, doc.mimeType)
  const status = doc.status ?? 'ready'
  const processing = isKnowledgeDocProcessing(status)
  const statusLabel = getKnowledgeDocStatusLabel(status, t, doc.ingestProgress)
  const isUrlDoc = isUrlMode || doc.sourceKind === 'url'
  const pageUrl = isUrlDoc ? doc.absolutePath : null
  const canOpen = Boolean(isUrlDoc ? pageUrl : isOpenableLocalPath(doc.absolutePath))
  const noteId = !isUrlDoc ? resolveNoteIdFromKnowledgeDocument(doc) : null

  const handleOpenDocument = () => {
    if (noteId && onOpenNote?.(noteId)) return
    if (
      !isUrlDoc &&
      isMarkdownKnowledgeDocument(doc.title, doc.mimeType) &&
      doc.absolutePath &&
      onOpenMarkdownFile?.(doc)
    ) {
      return
    }
    if (isUrlDoc && pageUrl) {
      openExternalUrl(pageUrl)
      return
    }
    if (isOpenableLocalPath(doc.absolutePath)) {
      void openLocalFile(doc.absolutePath, onImportError)
    }
  }

  return (
    <li
      className={[
        'tm-kb-file-card',
        selected ? 'tm-kb-file-card--selected' : '',
        isUrlDoc ? 'tm-kb-file-card--url' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={(event) => onContextMenu?.(event, doc.id)}
    >
      <div
        className={[
          'tm-kb-file-card-icon',
          isUrlDoc ? 'tm-kb-file-card-icon--url' : `tm-kb-file-card-icon--${extension || 'default'}`,
        ].join(' ')}
      >
        {isUrlDoc ? <IconGlobe size={18} /> : <IconFile size={18} />}
      </div>

      <div className="tm-kb-file-card-main">
        {canOpen || noteId ? (
          <button
            type="button"
            className="tm-kb-file-card-title tm-kb-file-card-title--openable"
            title={isUrlDoc ? pageUrl! : doc.absolutePath ?? doc.title}
            onClick={handleOpenDocument}
          >
            {doc.title}
          </button>
        ) : (
          <div className="tm-kb-file-card-title" title={doc.title}>
            {doc.title}
          </div>
        )}
        <div className="tm-kb-file-card-meta">
          {formatKnowledgeDocTime(doc.updatedAt)}
          {isUrlDoc && pageUrl ? (
            <>
              {' · '}
              <button
                type="button"
                className="tm-kb-file-card-link"
                title={pageUrl}
                onClick={() => openExternalUrl(pageUrl)}
              >
                打开原链
              </button>
            </>
          ) : (
            <> · {formatKnowledgeFileSize(doc.sizeBytes)}</>
          )}
          {showIndexActions && status === 'ready' && doc.chunkCount != null && doc.chunkCount > 0
            ? ` · ${doc.chunkCount} 块`
            : ''}
        </div>
        {showIndexActions ? (
          <div
            className={[
              'tm-kb-file-card-status-text',
              processing ? 'tm-kb-file-card-status-text--processing' : '',
              status === 'failed' ? 'tm-kb-file-card-status-text--failed' : '',
              status === 'ready' ? 'tm-kb-file-card-status-text--ready' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {statusLabel}
          </div>
        ) : null}
        {doc.errorMessage ? <div className="tm-kb-file-card-error">{doc.errorMessage}</div> : null}
      </div>

      {showIndexActions && (onReindexDocument || onCancelIngestDocument || onDeleteDocument) ? (
        <div className="tm-kb-file-card-actions">
          {onReindexDocument ? (
            <button
              type="button"
              className="tm-kb-file-card-action"
              title={isUrlDoc ? '刷新网页' : '重新向量化'}
              disabled={ingesting || processing}
              onClick={() => onReindexDocument(doc.id)}
            >
              <IconRefresh size={16} className={processing ? 'tm-kb-file-card-action--spin' : undefined} />
            </button>
          ) : null}
          {processing && onCancelIngestDocument ? (
            <button
              type="button"
              className="tm-kb-file-card-action tm-kb-file-card-action--cancel"
              title={t('knowledgePage.filePanel.cancelIngest')}
              onClick={(event) => {
                event.stopPropagation()
                onCancelIngestDocument(doc.id)
              }}
            >
              <IconX size={14} />
            </button>
          ) : null}
          <span
            className={[
              'tm-kb-file-card-status',
              status === 'ready'
                ? 'tm-kb-file-card-status--ready'
                : status === 'failed'
                  ? 'tm-kb-file-card-status--failed'
                  : 'tm-kb-file-card-status--pending',
            ].join(' ')}
            title={statusLabel}
          >
            {status === 'ready' ? <IconCheck size={14} /> : null}
            {processing ? <IconRefresh size={14} className="tm-kb-file-card-action--spin" /> : null}
          </span>
          {onDeleteDocument ? (
            <button
              type="button"
              className="tm-kb-file-card-action tm-kb-file-card-action--danger"
              title={t('knowledgePage.filePanel.deleteFile')}
              disabled={processing}
              onClick={() => onDeleteDocument(doc.id)}
            >
              <IconTrash size={16} />
            </button>
          ) : null}
          {selectionEnabled ? (
            <KnowledgeBaseFilePanelSelectCheckbox
              checked={selected}
              disabled={processing}
              title={t('knowledgePage.filePanel.selectFile')}
              onChange={() => onToggleSelect?.(doc.id)}
            />
          ) : null}
        </div>
      ) : onDeleteDocument ? (
        <div className="tm-kb-file-card-actions">
          <button
            type="button"
            className="tm-kb-file-card-action tm-kb-file-card-action--danger"
            title="删除文件"
            disabled={ingesting}
            onClick={() => onDeleteDocument(doc.id)}
          >
            <IconTrash size={16} />
          </button>
          {selectionEnabled ? (
            <KnowledgeBaseFilePanelSelectCheckbox
              checked={selected}
              title={t('knowledgePage.filePanel.selectFile')}
              onChange={() => onToggleSelect?.(doc.id)}
            />
          ) : null}
        </div>
      ) : selectionEnabled ? (
        <div className="tm-kb-file-card-actions">
          <KnowledgeBaseFilePanelSelectCheckbox
            checked={selected}
            title={t('knowledgePage.filePanel.selectFile')}
            onChange={() => onToggleSelect?.(doc.id)}
          />
        </div>
      ) : null}
    </li>
  )
}
