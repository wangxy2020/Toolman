import type { P2pSharedResource } from '@toolman/shared'
import { IconAccess, IconNotes, IconTrash } from '../../components/icons'
import { formatKnowledgeDocTime } from '../knowledge/knowledge-file-display'
import type { NoteItem } from '../notes/notes-storage'
import { formatNotePermissionLabel } from './group-note-utils'
import type { OpenGroupNoteRequest } from './group-note-open'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'

interface NoteListItem {
  resource: P2pSharedResource
  note: NoteItem | null
}

interface Props {
  items: NoteListItem[]
  selectedIds: Set<string>
  canDeleteNote: (resource: P2pSharedResource) => boolean
  removingId?: string | null
  onToggleSelect: (resourceId: string) => void
  onRemove: (resourceId: string) => void
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenNoteMenu?: (
    resource: P2pSharedResource,
    note: NoteItem | null,
    anchor: { x: number; y: number; align: 'bottom-start' },
  ) => void
  onContextMenu?: (event: React.MouseEvent) => void
}

function buildPreview(note: NoteItem | null): string {
  if (!note?.content.trim()) return '空笔记'
  return note.content.replace(/\s+/g, ' ').trim().slice(0, 80)
}

export function GroupNoteList({
  items,
  selectedIds,
  canDeleteNote,
  removingId,
  onToggleSelect,
  onRemove,
  onOpenGroupNote,
  onOpenNoteMenu,
  onContextMenu,
}: Props) {
  return (
    <ul className="tm-kb-file-list" onContextMenu={onContextMenu}>
      {items.map(({ resource, note }) => {
        const noteId = resource.localResourceId ?? resource.id
        const title = note?.title ?? resource.name
        const updatedAt = note?.updatedAt ?? resource.updatedAt
        const removing = removingId === resource.id
        const selected = selectedIds.has(resource.id)
        const canDelete = canDeleteNote(resource)

        return (
          <li
            key={resource.id}
            className={[
              'tm-kb-file-card',
              'tm-group-file-card',
              'tm-group-note-card',
              selected ? 'tm-kb-file-card--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="tm-kb-file-card-icon tm-kb-file-card-icon--note">
              <IconNotes size={18} />
            </div>

            <div className="tm-kb-file-card-main tm-group-file-card-main">
              <button
                type="button"
                className="tm-kb-file-card-title tm-kb-file-card-title--openable"
                title={title}
                onClick={() =>
                  onOpenGroupNote?.({
                    noteId,
                    workspaceId: resource.workspaceId,
                    workspaceName: '',
                    permission: resource.permission,
                    sharedBy: resource.sharedBy,
                    title,
                    editable: false,
                  })
                }
              >
                {title}
              </button>
              <div className="tm-kb-file-card-meta">
                {formatKnowledgeDocTime(updatedAt)} · {formatNotePermissionLabel(resource.permission)} ·{' '}
                {buildPreview(note)}
              </div>
            </div>

            <div className="tm-kb-file-card-actions">
              <button
                type="button"
                className="tm-kb-file-card-action"
                title="笔记操作"
                aria-label="笔记操作"
                onClick={(event) => {
                  event.stopPropagation()
                  const rect = event.currentTarget.getBoundingClientRect()
                  onOpenNoteMenu?.(resource, note, {
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
                      onRemove(resource.id)
                    }}
                  >
                    <IconTrash size={16} />
                  </button>
                  <GroupFileSelectCheckbox
                    checked={selected}
                    onChange={() => onToggleSelect(resource.id)}
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
