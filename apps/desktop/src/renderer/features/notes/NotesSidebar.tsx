import { useMemo, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconChevronRight, IconNotes, IconPlus } from '../../components/icons'
import { isGroupNotebookId } from '../group/group-note-utils'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { translateNotebookName } from '../../i18n/system-labels'
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
  const { t } = useI18n()
  const config = getModulePageConfig('notes', t)
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
              {t('common.all')}
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
            <span>
              {t('sidebar.notes.filtered', {
                query: searchQuery.trim() ? `「${searchQuery.trim()}」` : '',
                tag: activeTagFilter ? ` #${activeTagFilter}` : '',
              })}
            </span>
            <button
              type="button"
              className="tm-notes-sidebar-import-btn"
              onClick={() => {
                onSearchQueryChange('')
                onTagFilterChange(null)
              }}
            >
              {t('common.clear')}
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
                      title={isOpen ? t('sidebar.notes.collapseNotes') : t('sidebar.notes.expandNotes')}
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
                        title={translateNotebookName(notebook.name, t)}
                      >
                        {translateNotebookName(notebook.name, t)}
                      </button>
                    )}
                    <div className="tm-assistant-actions">
                      <button
                        type="button"
                        className="tm-assistant-action-btn"
                        title={t('sidebar.notes.newNote')}
                        onClick={() => onCreateNote(notebook.id)}
                      >
                        <IconPlus size={14} />
                      </button>
                    </div>
                  </div>

                  {isOpen &&
                    (notebookNotes.length === 0 ? (
                      <div className="tm-session-empty">{t('sidebar.notes.emptyNoNotes')}</div>
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
          deleteLabel={t('sidebar.notes.deleteNotebook')}
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
          deleteLabel={t('sidebar.notes.deleteNote')}
          onClose={() => setNoteContextMenu(null)}
          onIngest={() => onIngestNote?.(noteContextMenu.note.id, noteContextMenu.note.title)}
          onDelete={() => setDeleteNoteTarget(noteContextMenu.note)}
        />
      ) : null}

      {ingestNotebookTarget ? (
        <ConfirmDialog
          title={t('sidebar.notes.addToKnowledge')}
          message={t('sidebar.notes.ingestMessage', { name: ingestNotebookTarget.name })}
          confirmLabel={t('common.add')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setIngestNotebookTarget(null)}
          onConfirm={() => {
            onIngestNotebook?.(ingestNotebookTarget.id, ingestNotebookTarget.name)
            setIngestNotebookTarget(null)
          }}
        />
      ) : null}

      {deleteNoteTarget ? (
        <ConfirmDialog
          title={t('sidebar.notes.deleteNoteTitle')}
          message={t('sidebar.notes.deleteNoteMessage', { title: deleteNoteTarget.title })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
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
          title={t('sidebar.notes.deleteNotebookTitle')}
          message={
            isGroupNotebookId(deleteNotebookTarget.id)
              ? t('sidebar.notes.deleteNotebookLocalMessage', { name: deleteNotebookTarget.name })
              : t('sidebar.notes.deleteNotebookMessage', { name: deleteNotebookTarget.name })
          }
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
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
