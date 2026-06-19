import { useMemo, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconChevronRight, IconNotes, IconPlus } from '../../components/icons'
import { isGroupNotebookId } from '../group/group-note-utils'
import { getModulePageConfig } from '../modules/module-config'
import { collectAllTags } from './notes-search'
import { normalizeRenameTitle, type NoteItem, type NotebookItem } from './notes-storage'
import { NotesSidebarContextMenu } from './NotesSidebarContextMenu'
import { SidebarRenameInput } from './SidebarRenameInput'

type RenameTarget =
  | { kind: 'notebook'; id: string }
  | { kind: 'note'; id: string }
  | null

interface Props {
  notebooks: NotebookItem[]
  notesByNotebook: Map<string, NoteItem[]>
  activeNoteId: string | null
  expandedNotebookIds: Set<string>
  searchQuery: string
  activeTagFilter: string | null
  onSearchQueryChange: (query: string) => void
  onTagFilterChange: (tag: string | null) => void
  onToggleExpanded: (notebookId: string) => void
  onCreateNotebook: () => void
  onCreateNote: (notebookId: string) => void
  onSelectNote: (noteId: string) => void
  onRenameNotebook: (notebookId: string, name: string) => void
  onRenameNote: (noteId: string, title: string) => void
  onDeleteNotebook: (notebookId: string) => void
  onDeleteNote: (noteId: string) => void
  onIngestNotebook?: (notebookId: string, notebookName: string) => void
  onIngestNote?: (noteId: string, noteTitle: string) => void
}

export function NotesSidebar({
  notebooks,
  notesByNotebook,
  activeNoteId,
  expandedNotebookIds,
  searchQuery,
  activeTagFilter,
  onSearchQueryChange,
  onTagFilterChange,
  onToggleExpanded,
  onCreateNotebook,
  onCreateNote,
  onSelectNote,
  onRenameNotebook,
  onRenameNote,
  onDeleteNotebook,
  onDeleteNote,
  onIngestNotebook,
  onIngestNote,
}: Props) {
  const config = getModulePageConfig('notes')
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null)
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<NoteItem | null>(null)
  const [deleteNotebookTarget, setDeleteNotebookTarget] = useState<NotebookItem | null>(null)
  const [ingestNotebookTarget, setIngestNotebookTarget] = useState<NotebookItem | null>(null)
  const [notebookContextMenu, setNotebookContextMenu] = useState<{
    x: number
    y: number
    notebook: NotebookItem
  } | null>(null)
  const [noteContextMenu, setNoteContextMenu] = useState<{
    x: number
    y: number
    note: NoteItem
  } | null>(null)

  const allNotes = useMemo(
    () => notebooks.flatMap((notebook) => notesByNotebook.get(notebook.id) ?? []),
    [notebooks, notesByNotebook],
  )
  const tags = useMemo(() => collectAllTags(allNotes), [allNotes])
  const filtering = Boolean(searchQuery.trim() || activeTagFilter)

  const activeNotebookId = notebooks.find((notebook) =>
    (notesByNotebook.get(notebook.id) ?? []).some((note) => note.id === activeNoteId),
  )?.id

  const renderNote = (note: NoteItem) => {
    const isActive = activeNoteId === note.id
    const isRenaming = renameTarget?.kind === 'note' && renameTarget.id === note.id

    if (isRenaming) {
      return (
        <SidebarRenameInput
          key={note.id}
          value={note.title}
          className="tm-sidebar-rename-input tm-sidebar-rename-input--note"
          onCommit={(next) => {
            onRenameNote(note.id, normalizeRenameTitle(next, note.title))
            setRenameTarget(null)
          }}
          onCancel={() => setRenameTarget(null)}
        />
      )
    }

    return (
      <button
        key={note.id}
        type="button"
        className={[
          'tm-session-item',
          'tm-session-item--with-icon',
          isActive ? 'tm-session-item--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelectNote(note.id)}
        onDoubleClick={(event) => {
          event.preventDefault()
          setRenameTarget({ kind: 'note', id: note.id })
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setNoteContextMenu({
            x: event.clientX,
            y: event.clientY,
            note,
          })
        }}
        title={note.title}
      >
        <span className="tm-session-item-icon" aria-hidden="true">
          <IconNotes size={14} />
        </span>
        <span className="tm-session-item-label">{note.title}</span>
      </button>
    )
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={onCreateNotebook}>
          <IconPlus />
          {config.addLabel}
        </button>

        {tags.length > 0 ? (
          <div className="tm-notes-sidebar-tags">
            <button
              type="button"
              className={[
                'tm-notes-sidebar-tag-btn',
                activeTagFilter === null ? 'tm-notes-sidebar-tag-btn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onTagFilterChange(null)}
            >
              全部
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={[
                  'tm-notes-sidebar-tag-btn',
                  activeTagFilter === tag ? 'tm-notes-sidebar-tag-btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onTagFilterChange(activeTagFilter === tag ? null : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        ) : null}

        {filtering ? (
          <div className="tm-notes-sidebar-filter-hint">
            <span>已筛选{searchQuery.trim() ? `「${searchQuery.trim()}」` : ''}{activeTagFilter ? ` #${activeTagFilter}` : ''}</span>
            <button
              type="button"
              className="tm-notes-sidebar-import-btn"
              onClick={() => {
                onSearchQueryChange('')
                onTagFilterChange(null)
              }}
            >
              清除
            </button>
          </div>
        ) : null}

        <div className="tm-sidebar-list">
          {notebooks.length === 0 ? (
            <div className="tm-empty">{config.sidebarEmptyHint}</div>
          ) : (
            notebooks.map((notebook) => {
              const notebookNotes = notesByNotebook.get(notebook.id) ?? []
              const isOpen = expandedNotebookIds.has(notebook.id)
              const isActive = notebook.id === activeNotebookId
              const isRenaming =
                renameTarget?.kind === 'notebook' && renameTarget.id === notebook.id

              return (
                <div key={notebook.id} className="tm-assistant-group">
                  <div
                    className={[
                      'tm-assistant-row',
                      isOpen ? 'tm-assistant-row--open' : '',
                      isActive ? 'tm-assistant-row--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <button
                      type="button"
                      className="tm-assistant-expand"
                      title={isOpen ? '收起笔记' : '展开笔记'}
                      onClick={() => onToggleExpanded(notebook.id)}
                    >
                      <IconChevronRight open={isOpen} />
                    </button>
                    {isRenaming ? (
                      <SidebarRenameInput
                        value={notebook.name}
                        className="tm-sidebar-rename-input"
                        onCommit={(next) => {
                          onRenameNotebook(notebook.id, normalizeRenameTitle(next, notebook.name))
                          setRenameTarget(null)
                        }}
                        onCancel={() => setRenameTarget(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        className={[
                          'tm-assistant-name',
                          notebook.isDefault ? 'tm-assistant-name--default' : '',
                          isActive ? 'tm-assistant-name--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => onToggleExpanded(notebook.id)}
                        onDoubleClick={(event) => {
                          event.preventDefault()
                          setRenameTarget({ kind: 'notebook', id: notebook.id })
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          const canDelete = !notebook.isDefault
                          const canIngest = Boolean(onIngestNotebook)
                          if (!canDelete && !canIngest) return
                          setNotebookContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            notebook,
                          })
                        }}
                        title={notebook.name}
                      >
                        {notebook.name}
                      </button>
                    )}
                    <div className="tm-assistant-actions">
                      <button
                        type="button"
                        className="tm-assistant-action-btn"
                        title="新建笔记"
                        onClick={() => onCreateNote(notebook.id)}
                      >
                        <IconPlus size={14} />
                      </button>
                    </div>
                  </div>

                  {isOpen &&
                    (notebookNotes.length === 0 ? (
                      <div className="tm-session-empty">暂无笔记，点击 + 新建</div>
                    ) : (
                      notebookNotes.map(renderNote)
                    ))}
                </div>
              )
            })
          )}
        </div>
      </div>

      {notebookContextMenu ? (
        <NotesSidebarContextMenu
          x={notebookContextMenu.x}
          y={notebookContextMenu.y}
          canDelete={!notebookContextMenu.notebook.isDefault}
          canIngest={Boolean(onIngestNotebook)}
          deleteLabel="删除笔记本"
          onClose={() => setNotebookContextMenu(null)}
          onIngest={() => setIngestNotebookTarget(notebookContextMenu.notebook)}
          onDelete={() => setDeleteNotebookTarget(notebookContextMenu.notebook)}
        />
      ) : null}

      {noteContextMenu ? (
        <NotesSidebarContextMenu
          x={noteContextMenu.x}
          y={noteContextMenu.y}
          canDelete
          canIngest={Boolean(onIngestNote)}
          deleteLabel="删除笔记"
          onClose={() => setNoteContextMenu(null)}
          onIngest={() => onIngestNote?.(noteContextMenu.note.id, noteContextMenu.note.title)}
          onDelete={() => setDeleteNoteTarget(noteContextMenu.note)}
        />
      ) : null}

      {ingestNotebookTarget ? (
        <ConfirmDialog
          title="添加到知识库"
          message={`将「${ingestNotebookTarget.name}」下的全部笔记添加到知识库？`}
          confirmLabel="添加"
          cancelLabel="取消"
          onCancel={() => setIngestNotebookTarget(null)}
          onConfirm={() => {
            onIngestNotebook?.(ingestNotebookTarget.id, ingestNotebookTarget.name)
            setIngestNotebookTarget(null)
          }}
        />
      ) : null}

      {deleteNoteTarget ? (
        <ConfirmDialog
          title="删除笔记"
          message={`确定删除「${deleteNoteTarget.title}」？删除后无法恢复。`}
          confirmLabel="删除"
          cancelLabel="取消"
          danger
          onCancel={() => setDeleteNoteTarget(null)}
          onConfirm={() => {
            onDeleteNote(deleteNoteTarget.id)
            setDeleteNoteTarget(null)
          }}
        />
      ) : null}

      {deleteNotebookTarget ? (
        <ConfirmDialog
          title="删除笔记本"
          message={
            isGroupNotebookId(deleteNotebookTarget.id)
              ? `确定删除本地「${deleteNotebookTarget.name}」笔记本及其缓存笔记？群组中的共享内容不受影响。`
              : `确定删除「${deleteNotebookTarget.name}」？该笔记本下的笔记将一并删除，且无法恢复。`
          }
          confirmLabel="删除"
          cancelLabel="取消"
          danger
          onCancel={() => setDeleteNotebookTarget(null)}
          onConfirm={() => {
            onDeleteNotebook(deleteNotebookTarget.id)
            setDeleteNotebookTarget(null)
          }}
        />
      ) : null}
    </aside>
  )
}
