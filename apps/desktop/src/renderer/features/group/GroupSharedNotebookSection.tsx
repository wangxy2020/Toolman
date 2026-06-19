import { useEffect, useMemo, useState } from 'react'
import type { P2pSharedResource } from '@toolman/shared'
import { IconChevronRight, IconTrash } from '../../components/icons'
import type { NoteItem } from '../notes/notes-storage'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'
import type { OpenGroupNoteRequest } from './group-note-open'
import { GroupNoteList } from './GroupNoteList'

export interface GroupNoteListItem {
  resource: P2pSharedResource
  note: NoteItem | null
}

interface Props {
  notebookId: string
  notebookName: string
  items: GroupNoteListItem[]
  selectedIds: Set<string>
  canDeleteNote: (resource: P2pSharedResource) => boolean
  removingNotebook?: boolean
  removingId?: string | null
  onToggleSelect: (resourceId: string) => void
  onToggleSelectSection: (resourceIds: string[]) => void
  onRemoveNotebook: () => void
  onRemoveNote: (resourceId: string) => void
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenNoteMenu?: (
    resource: P2pSharedResource,
    note: NoteItem | null,
    anchor: { x: number; y: number; align: 'bottom-start' },
  ) => void
  onContextMenu?: (event: React.MouseEvent) => void
  onSectionKeysChange?: (notebookId: string, resourceIds: string[]) => void
}

export function GroupSharedNotebookSection({
  notebookId,
  notebookName,
  items,
  selectedIds,
  canDeleteNote,
  removingNotebook,
  removingId,
  onToggleSelect,
  onToggleSelectSection,
  onRemoveNotebook,
  onRemoveNote,
  onOpenGroupNote,
  onOpenNoteMenu,
  onContextMenu,
  onSectionKeysChange,
}: Props) {
  const [expanded, setExpanded] = useState(true)

  const sectionResourceIds = useMemo(
    () => items.map((item) => item.resource.id),
    [items],
  )

  useEffect(() => {
    onSectionKeysChange?.(notebookId, sectionResourceIds)
  }, [notebookId, onSectionKeysChange, sectionResourceIds])

  const sectionSelectedCount = sectionResourceIds.filter((id) => selectedIds.has(id)).length
  const sectionFullySelected =
    sectionResourceIds.length > 0 && sectionSelectedCount === sectionResourceIds.length
  const sectionPartiallySelected =
    sectionSelectedCount > 0 && sectionSelectedCount < sectionResourceIds.length

  const canManageSection = items.some((item) => canDeleteNote(item.resource))

  return (
    <section className="tm-group-kb-section">
      <header className="tm-group-kb-section-header">
        <button
          type="button"
          className="tm-group-kb-section-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <IconChevronRight open={expanded} />
        </button>

        <button
          type="button"
          className="tm-group-kb-section-heading"
          onClick={() => setExpanded((current) => !current)}
        >
          <h3 className="tm-group-kb-section-title">{notebookName}</h3>
          <p className="tm-group-kb-section-meta">{items.length} 篇笔记</p>
        </button>

        {canManageSection ? (
          <div className="tm-group-kb-section-actions">
            <button
              type="button"
              className="tm-kb-file-card-action tm-kb-file-card-action--danger"
              title="从群组移除笔记本下全部笔记"
              disabled={removingNotebook}
              onClick={onRemoveNotebook}
            >
              <IconTrash size={16} />
            </button>
            <GroupFileSelectCheckbox
              checked={sectionFullySelected}
              title={sectionPartiallySelected ? '部分选中' : '选择笔记本内全部笔记'}
              onChange={() => onToggleSelectSection(sectionResourceIds)}
            />
          </div>
        ) : null}
      </header>

      {expanded ? (
        items.length === 0 ? (
          <p className="tm-kb-file-panel-empty">暂无共享笔记</p>
        ) : (
          <GroupNoteList
            items={items}
            selectedIds={selectedIds}
            canDeleteNote={canDeleteNote}
            removingId={removingId}
            onToggleSelect={onToggleSelect}
            onRemove={onRemoveNote}
            onOpenGroupNote={onOpenGroupNote}
            onOpenNoteMenu={onOpenNoteMenu}
            onContextMenu={onContextMenu}
          />
        )
      ) : null}
    </section>
  )
}
