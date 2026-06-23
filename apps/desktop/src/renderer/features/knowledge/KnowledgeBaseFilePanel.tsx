import { useState } from 'react'
import { IpcChannel, type KnowledgeDocument } from '@toolman/shared'
import { IconCheck, IconFile, IconGlobe, IconRefresh, IconTrash } from '../../components/icons'
import {
  formatKnowledgeDocTime,
  formatKnowledgeFileSize,
  getKnowledgeDocExtension,
  getKnowledgeDocStatusLabel,
  isKnowledgeDocProcessing,
  isMarkdownKnowledgeDocument,
} from './knowledge-file-display'
import { getLocalFilePaths } from './knowledge-file-paths'
import { resolveNoteIdFromKnowledgeDocument } from './knowledge-note-link'

export interface KnowledgeFilePanelItem {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  sizeBytes?: number | null
  mimeType?: string | null
  status?: KnowledgeDocument['status'] | 'pending'
  chunkCount?: number
  errorMessage?: string | null
  absolutePath?: string | null
  sourceKind?: KnowledgeDocument['sourceKind']
}

interface Props {
  documents: KnowledgeFilePanelItem[]
  loading?: boolean
  ingesting?: boolean
  importDisabled?: boolean
  hideDropzone?: boolean
  showIndexActions?: boolean
  defaultImportPath?: string | null
  mode?: 'file' | 'url'
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onImportFiles: (paths: string[]) => void | Promise<void>
  onImportError?: (message: string) => void
  onOpenAddUrl?: () => void
  onAddUrl?: (url: string) => void | Promise<void>
  onReindexDocument?: (id: string) => void
  onDeleteDocument?: (id: string) => void
  onOpenNote?: (noteId: string) => boolean
  onOpenMarkdownFile?: (doc: KnowledgeFilePanelItem) => boolean | void
  onContextMenu?: (event: React.MouseEvent, documentId?: string) => void
}

export function knowledgeDocumentToPanelItem(doc: KnowledgeDocument): KnowledgeFilePanelItem {
  return {
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    status: doc.status,
    chunkCount: doc.chunkCount,
    errorMessage: doc.errorMessage,
    absolutePath: doc.absolutePath,
    sourceKind: doc.sourceKind,
  }
}

function openExternalUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function openLocalFile(path: string, onError?: (message: string) => void) {
  const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
  if (!result.ok) {
    onError?.(result.error.message)
  }
}

function isOpenableLocalPath(path: string | null | undefined): path is string {
  if (!path) return false
  return !/^https?:\/\//i.test(path)
}

function FileSelectCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label className="tm-kb-file-card-select" title="选择文件">
      <input
        type="checkbox"
        className="tm-kb-file-card-select-input"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className={[
          'tm-kb-file-card-select-box',
          checked ? 'tm-kb-file-card-select-box--checked' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      />
    </label>
  )
}

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
  onDeleteDocument,
  onOpenNote,
  onOpenMarkdownFile,
  onContextMenu,
}: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [picking, setPicking] = useState(false)
  const isUrlMode = mode === 'url'
  const dropzoneDisabled = ingesting || importDisabled || picking

  const extractDroppedUrl = (dataTransfer: DataTransfer): string | null => {
    const uriList = dataTransfer.getData('text/uri-list').trim()
    if (uriList) {
      const firstLine = uriList.split('\n').find((line) => line.trim() && !line.startsWith('#'))
      if (firstLine) return firstLine.trim()
    }

    const plain = dataTransfer.getData('text/plain').trim()
    if (/^https?:\/\//i.test(plain)) return plain
    return null
  }

  const importPaths = (files: FileList | File[], dataTransfer?: DataTransfer | null) => {
    const paths = getLocalFilePaths(files, dataTransfer)
    if (paths.length === 0) {
      onImportError?.('无法获取文件路径，请重试或点击区域选择文件')
      return
    }
    void onImportFiles(paths)
  }

  const handlePickFiles = async () => {
    if (dropzoneDisabled) return

    if (isUrlMode) {
      onOpenAddUrl?.()
      return
    }

    setPicking(true)

    const result = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      multiple: true,
      defaultPath: defaultImportPath ?? undefined,
    })
    setPicking(false)

    if (!result.ok) {
      onImportError?.(result.error.message)
      return
    }

    const { paths } = result.data as { paths: string[] }
    if (paths.length === 0) return

    void onImportFiles(paths)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    if (ingesting || importDisabled) return

    if (isUrlMode) {
      const url = extractDroppedUrl(event.dataTransfer)
      if (!url) {
        onImportError?.('请拖拽有效的网页链接')
        return
      }
      void onAddUrl?.(url)
      return
    }

    importPaths(event.dataTransfer.files, event.dataTransfer)
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    if (!ingesting && !importDisabled) {
      event.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
  }

  return (
    <div
      className={hideDropzone ? 'tm-kb-file-panel tm-kb-file-panel--list-only' : 'tm-kb-file-panel'}
      onDragEnter={hideDropzone ? undefined : handleDragOver}
      onDragOver={hideDropzone ? undefined : handleDragOver}
      onDragLeave={
        hideDropzone
          ? undefined
          : (event) => {
              event.preventDefault()
              if (event.currentTarget === event.target) {
                setDragOver(false)
              }
            }
      }
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
            {isUrlMode ? '拖拽网页到这里或点击添加' : '拖拽文件到这里或点击添加'}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            {isUrlMode
              ? '支持 HTTP/HTTPS 网页链接，也可从浏览器拖拽书签或链接'
              : '支持 TXT, MD, HTML, PDF, DOCX, PPTX, XLSX, EPUB... 格式'}
          </span>
        </button>
      ) : null}

      {loading && documents.length === 0 ? (
        <p className="tm-kb-file-panel-empty">加载文件中…</p>
      ) : null}

      {!loading && documents.length === 0 ? (
        <p className="tm-kb-file-panel-empty">{isUrlMode ? '暂无网页' : '暂无文件'}</p>
      ) : null}

      {documents.length > 0 ? (
        <ul className="tm-kb-file-list" onContextMenu={onContextMenu}>
          {documents.map((doc) => {
            const extension = getKnowledgeDocExtension(doc.title, doc.mimeType)
            const status = doc.status ?? 'ready'
            const processing = isKnowledgeDocProcessing(status)
            const statusLabel = getKnowledgeDocStatusLabel(status)
            const selected = selectedIds?.has(doc.id) ?? false
            const selectionEnabled = Boolean(onToggleSelect)
            const isUrlDoc = isUrlMode || doc.sourceKind === 'url'
            const pageUrl = isUrlDoc ? doc.absolutePath : null
            const canOpen = Boolean(
              isUrlDoc ? pageUrl : isOpenableLocalPath(doc.absolutePath),
            )
            const noteId = !isUrlDoc ? resolveNoteIdFromKnowledgeDocument(doc) : null

            const handleOpenDocument = () => {
              if (noteId && onOpenNote?.(noteId)) {
                return
              }
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
                key={doc.id}
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
                    isUrlDoc
                      ? 'tm-kb-file-card-icon--url'
                      : `tm-kb-file-card-icon--${extension || 'default'}`,
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
                  {doc.errorMessage ? (
                    <div className="tm-kb-file-card-error">{doc.errorMessage}</div>
                  ) : null}
                </div>

                {showIndexActions && (onReindexDocument || onDeleteDocument) ? (
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
                        title="删除文件"
                        disabled={processing}
                        onClick={() => onDeleteDocument(doc.id)}
                      >
                        <IconTrash size={16} />
                      </button>
                    ) : null}
                    {selectionEnabled ? (
                      <FileSelectCheckbox
                        checked={selected}
                        disabled={processing}
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
                      <FileSelectCheckbox
                        checked={selected}
                        onChange={() => onToggleSelect?.(doc.id)}
                      />
                    ) : null}
                  </div>
                ) : selectionEnabled ? (
                  <div className="tm-kb-file-card-actions">
                    <FileSelectCheckbox
                      checked={selected}
                      onChange={() => onToggleSelect?.(doc.id)}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
