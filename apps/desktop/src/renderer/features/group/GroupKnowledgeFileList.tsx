import { IpcChannel } from '@toolman/shared'
import { IconAccess, IconCheck, IconFile, IconGlobe, IconRefresh, IconTrash } from '../../components/icons'
import {
  formatKnowledgeDocTime,
  formatKnowledgeFileSize,
  getKnowledgeDocExtension,
  getKnowledgeDocStatusLabel,
  isKnowledgeDocProcessing,
  isMarkdownKnowledgeDocument,
} from '../knowledge/knowledge-file-display'
import { resolveNoteIdFromKnowledgeDocument } from '../knowledge/knowledge-note-link'
import type { KnowledgeFilePanelItem } from '../knowledge/KnowledgeBaseFilePanel'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest } from './group-note-open'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'
import { knowledgeSelectionKey } from './group-knowledge-selection'

interface Props {
  resourceId: string
  p2pWorkspaceId: string
  workspaceName: string
  documents: KnowledgeFilePanelItem[]
  selectedKeys: Set<string>
  canDelete: boolean
  ingesting?: boolean
  removingDocumentId?: string | null
  onToggleSelect: (selectionKey: string) => void
  onRemoveDocument: (documentId: string) => void
  onReindexDocument?: (documentId: string) => void
  onOpenNote?: (noteId: string) => boolean
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenGroupKnowledgeMarkdown?: (
    request: OpenGroupKnowledgeMarkdownRequest,
  ) => void | Promise<void>
  onOpenFileMenu?: (
    doc: KnowledgeFilePanelItem,
    anchor: { x: number; y: number; align: 'bottom-start' },
  ) => void
  onOpenError?: (message: string) => void
  onContextMenu?: (event: React.MouseEvent) => void
}

function isOpenableLocalPath(path: string | null | undefined): path is string {
  if (!path) return false
  return !/^https?:\/\//i.test(path)
}

async function openLocalFile(path: string, onError?: (message: string) => void) {
  const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
  if (!result.ok) {
    onError?.(result.error.message)
  }
}

export function GroupKnowledgeFileList({
  resourceId,
  p2pWorkspaceId,
  workspaceName,
  documents,
  selectedKeys,
  canDelete,
  ingesting = false,
  removingDocumentId,
  onToggleSelect,
  onRemoveDocument,
  onReindexDocument,
  onOpenNote,
  onOpenGroupNote,
  onOpenGroupKnowledgeMarkdown,
  onOpenFileMenu,
  onOpenError,
  onContextMenu,
}: Props) {
  return (
    <ul className="tm-kb-file-list" onContextMenu={onContextMenu}>
      {documents.map((doc) => {
        const isUrlDoc = doc.sourceKind === 'url'
        const noteId = !isUrlDoc ? resolveNoteIdFromKnowledgeDocument(doc) : null
        const isMarkdown = !isUrlDoc && isMarkdownKnowledgeDocument(doc.title, doc.mimeType)
        const pageUrl = isUrlDoc ? doc.absolutePath : null
        const status = doc.status ?? 'ready'
        const processing = isKnowledgeDocProcessing(status)
        const statusLabel = getKnowledgeDocStatusLabel(status)
        const canOpen = Boolean(
          noteId ||
            isMarkdown ||
            (isUrlDoc ? pageUrl : isOpenableLocalPath(doc.absolutePath)),
        )
        const selectionKey = knowledgeSelectionKey(resourceId, doc.id)
        const selected = selectedKeys.has(selectionKey)
        const removing = removingDocumentId === doc.id
        const extension = getKnowledgeDocExtension(doc.title, doc.mimeType)

        const handleOpen = () => {
          if (noteId) {
            if (onOpenGroupNote) {
              void onOpenGroupNote({
                noteId,
                workspaceId: p2pWorkspaceId,
                workspaceName,
                permission: 'read',
                sharedBy: '',
                title: doc.title,
                editable: false,
              })
              return
            }
            if (onOpenNote?.(noteId)) return
          }
          if (
            isMarkdown &&
            doc.absolutePath &&
            onOpenGroupKnowledgeMarkdown
          ) {
            void onOpenGroupKnowledgeMarkdown({
              documentId: doc.id,
              workspaceId: p2pWorkspaceId,
              workspaceName,
              title: doc.title,
              absolutePath: doc.absolutePath,
            })
            return
          }
          if (isUrlDoc && pageUrl) {
            window.open(pageUrl, '_blank', 'noopener,noreferrer')
            return
          }
          if (isOpenableLocalPath(doc.absolutePath)) {
            void openLocalFile(doc.absolutePath, onOpenError)
          }
        }

        return (
          <li
            key={doc.id}
            className={[
              'tm-kb-file-card',
              'tm-group-file-card',
              'tm-group-note-card',
              isUrlDoc ? 'tm-kb-file-card--url' : '',
              selected ? 'tm-kb-file-card--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div
              className={[
                'tm-kb-file-card-icon',
                isUrlDoc
                  ? 'tm-kb-file-card-icon--url'
                  : `tm-kb-file-card-icon--${extension || 'default'}`,
              ].join(' ')}
            >
              {isUrlDoc ? <IconGlobe size={18} /> : <IconFile size={18} />}
            </div>

            <div className="tm-kb-file-card-main tm-group-file-card-main">
              {canOpen ? (
                <button
                  type="button"
                  className="tm-kb-file-card-title tm-kb-file-card-title--openable"
                  title={isUrlDoc ? pageUrl ?? doc.title : doc.absolutePath ?? doc.title}
                  onClick={handleOpen}
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
                {doc.sizeBytes != null ? ` · ${formatKnowledgeFileSize(doc.sizeBytes)}` : ''}
                {status === 'ready' && doc.chunkCount != null && doc.chunkCount > 0
                  ? ` · ${doc.chunkCount} 块`
                  : ''}
              </div>
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
              {doc.errorMessage ? (
                <div className="tm-kb-file-card-error">{doc.errorMessage}</div>
              ) : null}
            </div>

            <div className="tm-kb-file-card-actions">
              {onReindexDocument ? (
                <button
                  type="button"
                  className="tm-kb-file-card-action"
                  title={isUrlDoc ? '刷新网页' : '重新向量化'}
                  disabled={ingesting || processing}
                  onClick={(event) => {
                    event.stopPropagation()
                    onReindexDocument(doc.id)
                  }}
                >
                  <IconRefresh
                    size={16}
                    className={processing ? 'tm-kb-file-card-action--spin' : undefined}
                  />
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
                {processing ? (
                  <IconRefresh size={14} className="tm-kb-file-card-action--spin" />
                ) : null}
              </span>
              <button
                type="button"
                className="tm-kb-file-card-action"
                title="文件操作"
                aria-label="文件操作"
                onClick={(event) => {
                  event.stopPropagation()
                  const rect = event.currentTarget.getBoundingClientRect()
                  onOpenFileMenu?.(doc, {
                    x: rect.left,
                    y: rect.bottom + 4,
                    align: 'bottom-start',
                  })
                }}
              >
                <IconAccess size={16} />
              </button>
              {canDelete ? (
                <>
                  <button
                    type="button"
                    className="tm-kb-file-card-action tm-kb-file-card-action--danger"
                    title="从群组移除"
                    disabled={removing}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemoveDocument(doc.id)
                    }}
                  >
                    <IconTrash size={16} />
                  </button>
                  <GroupFileSelectCheckbox
                    checked={selected}
                    onChange={() => onToggleSelect(selectionKey)}
                  />
                </>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
