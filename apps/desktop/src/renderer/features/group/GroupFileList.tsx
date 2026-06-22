import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { P2pFileListItem } from '@toolman/shared'
import { IconFile, IconTrash } from '../../components/icons'
import {
  formatKnowledgeDocTime,
  formatKnowledgeFileSize,
  getKnowledgeDocExtension,
} from '../knowledge/knowledge-file-display'
import { resolveNoteIdFromFileName } from '../knowledge/knowledge-note-link'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'

interface FileItemProps {
  file: P2pFileListItem
  selected: boolean
  canDelete: boolean
  deleting: boolean
  opening: boolean
  onToggleSelect: () => void
  onDelete: () => void
  onOpenNote?: (noteId: string) => boolean
  onOpenFile?: (resourceId: string) => void
}

function GroupFileListItem({
  file,
  selected,
  canDelete,
  deleting,
  opening,
  onToggleSelect,
  onDelete,
  onOpenNote,
  onOpenFile,
}: FileItemProps) {
  const extension = getKnowledgeDocExtension(file.name, file.mimeType)
  const noteId = resolveNoteIdFromFileName(file.name)

  const handleOpen = () => {
    if (noteId && onOpenNote?.(noteId)) return
    onOpenFile?.(file.resourceId)
  }

  return (
    <li
      className={[
        'tm-kb-file-card',
        'tm-group-file-card',
        selected ? 'tm-kb-file-card--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={[
          'tm-kb-file-card-icon',
          `tm-kb-file-card-icon--${extension || 'default'}`,
        ].join(' ')}
      >
        <IconFile size={18} />
      </div>

      <div className="tm-kb-file-card-main tm-group-file-card-main">
        <div className="tm-group-file-card-title-row">
          <button
            type="button"
            className="tm-kb-file-card-title tm-kb-file-card-title--openable tm-group-file-card-title"
            title={`${file.name} v${file.version}`}
            disabled={opening}
            onClick={handleOpen}
          >
            <span className="tm-group-file-card-title-text">
              {opening ? '正在打开…' : file.name}
            </span>
            {!opening ? (
              <span className="tm-group-file-card-version-pill">v{file.version}</span>
            ) : null}
          </button>
        </div>

        <div className="tm-kb-file-card-meta">
          {formatKnowledgeDocTime(file.updatedAt)} · {formatKnowledgeFileSize(file.sizeBytes)}
        </div>
      </div>

      {canDelete ? (
        <div className="tm-kb-file-card-actions">
          <button
            type="button"
            className="tm-kb-file-card-action tm-kb-file-card-action--danger"
            title="移除文件"
            disabled={deleting}
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
          >
            <IconTrash size={16} />
          </button>
          <GroupFileSelectCheckbox checked={selected} onChange={onToggleSelect} />
        </div>
      ) : null}
    </li>
  )
}

interface Props {
  files: P2pFileListItem[]
  selectedIds: Set<string>
  canManageGroupFiles: boolean
  selfMemberId: string | null
  deletingId?: string | null
  onToggleSelect: (resourceId: string) => void
  onDelete: (resourceId: string) => void
  onOpenNote?: (noteId: string) => boolean
  onOpenFile?: (resourceId: string) => void
  openingId?: string | null
  onContextMenu?: (event: React.MouseEvent) => void
}

export function GroupFileList({
  files,
  selectedIds,
  canManageGroupFiles,
  selfMemberId,
  deletingId,
  onToggleSelect,
  onDelete,
  onOpenNote,
  onOpenFile,
  openingId,
  onContextMenu,
}: Props) {
  const canDeleteFile = (file: P2pFileListItem) =>
    canManageGroupFiles ||
    (selfMemberId != null &&
      (file.uploadedBy === selfMemberId || file.sharedBy === selfMemberId))

  return (
    <ul className="tm-kb-file-list" onContextMenu={onContextMenu}>
      {files.map((file) => (
        <GroupFileListItem
          key={file.resourceId}
          file={file}
          selected={selectedIds.has(file.resourceId)}
          canDelete={canDeleteFile(file)}
          deleting={deletingId === file.resourceId}
          onToggleSelect={() => onToggleSelect(file.resourceId)}
          onDelete={() => onDelete(file.resourceId)}
          onOpenNote={onOpenNote}
          onOpenFile={onOpenFile}
          opening={openingId === file.resourceId}
        />
      ))}
    </ul>
  )
}

interface ContextMenuProps {
  x: number
  y: number
  selectedCount: number
  enabled?: boolean
  canDelete: boolean
  deleteLabel?: string
  onClose: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDeleteSelected: () => void
}

export function GroupFileContextMenu({
  x,
  y,
  selectedCount,
  enabled = true,
  canDelete,
  deleteLabel = '移除已勾选',
  onClose,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
}: ContextMenuProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!enabled) return null

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label="关闭菜单"
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={{ top: y, left: x }} role="menu">
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            onSelectAll()
            onClose()
          }}
        >
          全选
        </button>
        <button
          type="button"
          className={[
            'tm-group-context-menu-item',
            selectedCount === 0 ? 'tm-group-context-menu-item--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menuitem"
          disabled={selectedCount === 0}
          onClick={() => {
            if (selectedCount === 0) return
            onClearSelection()
            onClose()
          }}
        >
          取消
        </button>
        <button
          type="button"
          className={[
            'tm-group-context-menu-item',
            'tm-group-context-menu-item--danger',
            selectedCount === 0 ? 'tm-group-context-menu-item--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menuitem"
          disabled={selectedCount === 0}
          onClick={() => {
            if (selectedCount === 0) return
            onDeleteSelected()
            onClose()
          }}
        >
          {deleteLabel}
          {selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
      </div>
    </>,
    document.body,
  )
}
