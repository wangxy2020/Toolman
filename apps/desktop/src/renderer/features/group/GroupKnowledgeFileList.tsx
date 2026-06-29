import { useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { IconDownload, IconFile, IconGlobe, IconTrash } from '../../components/icons'
import {
  formatKnowledgeDocTime,
  formatKnowledgeFileSize,
  getKnowledgeDocExtension,
  isKnowledgeDocProcessing,
  isMarkdownKnowledgeDocument,
} from '../knowledge/knowledge-file-display'
import { resolveNoteIdFromKnowledgeDocument } from '../knowledge/knowledge-note-link'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'
import { knowledgeSelectionKey } from './group-knowledge-selection'
import {
  getGroupKnowledgeStatusLabel,
} from './group-knowledge-panel-item'
import type { GroupKnowledgeFileListProps as Props } from './group-knowledge-file-list-types'

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
  isResourceOwner,
  documents,
  selectedKeys,
  canRemoveFromGroup,
  canRemoveSaved,
  canSelect,
  removingDocumentId,
  onToggleSelect,
  onRemoveFromGroup,
  onRemoveSaved,
  onOpenNote,
  onOpenGroupNote,
  onOpenGroupKnowledgeMarkdown,
  onMaterializeDocument,
  onEnsureDocumentSaved,
  onOpenError,
  onContextMenu,
}: Props) {
  const [savingDocumentId, setSavingDocumentId] = useState<string | null>(null)
  const [materializingDocumentId, setMaterializingDocumentId] = useState<string | null>(null)

  return (
    <ul className="tm-kb-file-list" onContextMenu={onContextMenu}>
      {documents.map((doc) => {
        const isUrlDoc = doc.sourceKind === 'url'
        const noteId = !isUrlDoc ? resolveNoteIdFromKnowledgeDocument(doc) : null
        const isMarkdown = !isUrlDoc && isMarkdownKnowledgeDocument(doc.title, doc.mimeType)
        const pageUrl = isUrlDoc ? doc.absolutePath : null
        const status = doc.status ?? 'ready'
        const processing = isKnowledgeDocProcessing(status)
        const savedToSharedKb = Boolean(doc.savedDocumentId)
        const saved = Boolean(savedToSharedKb && isOpenableLocalPath(doc.absolutePath))
        const removing = removingDocumentId === doc.id
        const saving = savingDocumentId === doc.id
        const materializing = materializingDocumentId === doc.id
        const statusLabel = saving
          ? '正在保存…'
          : getGroupKnowledgeStatusLabel(doc, isResourceOwner)
        const canOpen = isResourceOwner
          ? Boolean(
              noteId ||
                isMarkdown ||
                isUrlDoc ||
                onMaterializeDocument ||
                isOpenableLocalPath(doc.absolutePath),
            )
          : Boolean(
              saved &&
                (noteId ||
                  isMarkdown ||
                  isUrlDoc ||
                  isOpenableLocalPath(doc.absolutePath)),
            )
        const selectionKey = knowledgeSelectionKey(resourceId, doc.id)
        const selected = selectedKeys.has(selectionKey)
        const extension = getKnowledgeDocExtension(doc.title, doc.mimeType)
        const showRemove = canRemoveFromGroup || canRemoveSaved
        const removeTitle = canRemoveFromGroup
          ? '从群组移除'
          : savedToSharedKb
            ? '移除已保存副本'
            : '仅可移除已保存的文件'
        const removeDisabled = canRemoveFromGroup ? removing : !savedToSharedKb || removing

        const resolveOpenPath = async (): Promise<string | null> => {
          if (isOpenableLocalPath(doc.absolutePath)) {
            return doc.absolutePath
          }
          if (!onMaterializeDocument) return null
          setMaterializingDocumentId(doc.id)
          try {
            return await onMaterializeDocument(doc.id, doc.absolutePath)
          } finally {
            setMaterializingDocumentId(null)
          }
        }

        const handleOpen = async () => {
          if (!isResourceOwner && !saved) {
            onOpenError?.('请先保存至共享知识库后再打开')
            return
          }

          const absolutePath = await resolveOpenPath()

          if (noteId) {
            if (onOpenGroupNote) {
              void onOpenGroupNote({
                noteId,
                workspaceId: p2pWorkspaceId,
                workspaceName,
                title: doc.title,
              })
              return
            }
            if (onOpenNote?.(noteId)) return
          }
          if (isMarkdown && onOpenGroupKnowledgeMarkdown) {
            if (!absolutePath) {
              onOpenError?.('请先保存至共享知识库后再打开')
              return
            }
            void onOpenGroupKnowledgeMarkdown({
              documentId: doc.id,
              workspaceId: p2pWorkspaceId,
              workspaceName,
              title: doc.title,
              absolutePath,
            })
            return
          }
          if (isUrlDoc && pageUrl) {
            window.open(pageUrl, '_blank', 'noopener,noreferrer')
            return
          }
          if (isOpenableLocalPath(absolutePath)) {
            void openLocalFile(absolutePath, onOpenError)
          } else if (!materializing) {
            onOpenError?.('请先保存至共享知识库后再打开')
          }
        }

        const handleSave = async () => {
          if (!onEnsureDocumentSaved || savedToSharedKb) return
          setSavingDocumentId(doc.id)
          try {
            const result = await onEnsureDocumentSaved(doc.id, doc.absolutePath)
            if (!result) {
              onOpenError?.('保存失败，请查看页面底部错误提示')
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : '保存失败'
            onOpenError?.(message)
          } finally {
            setSavingDocumentId(null)
          }
        }

        const handleRemove = () => {
          if (canRemoveFromGroup) {
            onRemoveFromGroup(doc.id)
            return
          }
          if (canRemoveSaved && savedToSharedKb) {
            onRemoveSaved(doc.id)
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
                  title={isUrlDoc ? pageUrl ?? doc.title : doc.title}
                  disabled={materializing}
                  onClick={() => void handleOpen()}
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
              </div>
              <div
                className={[
                  'tm-kb-file-card-status-text',
                  savedToSharedKb && !isResourceOwner ? 'tm-kb-file-card-status-text--ready' : '',
                  processing ? 'tm-kb-file-card-status-text--processing' : '',
                  status === 'failed' ? 'tm-kb-file-card-status-text--failed' : '',
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
              {!isResourceOwner && onEnsureDocumentSaved ? (
                <button
                  type="button"
                  className="tm-kb-file-card-action"
                  title={savedToSharedKb ? '已保存到共享知识库' : '保存到共享知识库'}
                  aria-label={savedToSharedKb ? '已保存到共享知识库' : '保存到共享知识库'}
                  disabled={savedToSharedKb || saving}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleSave()
                  }}
                >
                  <IconDownload size={16} />
                </button>
              ) : null}
              {showRemove || canSelect ? (
                <>
                  {showRemove ? (
                    <button
                      type="button"
                      className="tm-kb-file-card-action tm-kb-file-card-action--danger"
                      title={removeTitle}
                      disabled={removeDisabled}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleRemove()
                      }}
                    >
                      <IconTrash size={16} />
                    </button>
                  ) : null}
                  {canSelect ? (
                    <GroupFileSelectCheckbox
                      checked={selected}
                      onChange={() => onToggleSelect(selectionKey)}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
