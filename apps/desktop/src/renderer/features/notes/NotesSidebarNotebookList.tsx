import { IconChevronRight, IconNotes, IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { translateNotebookName } from '../../i18n/system-labels'
import { SidebarRenameInput } from './SidebarRenameInput'
import { normalizeRenameTitle, type NoteItem, type NotebookItem } from './notes-storage'

interface NoteButtonProps {
  note: NoteItem
  isActive: boolean
  isRenaming: boolean
  onSelectNote: (noteId: string) => void
  onRenameNote: (noteId: string, title: string) => void
  onStartRename: () => void
  onCancelRename: () => void
  onContextMenu: (event: React.MouseEvent) => void
}

export function NotesSidebarNoteButton({
  note,
  isActive,
  isRenaming,
  onSelectNote,
  onRenameNote,
  onStartRename,
  onCancelRename,
  onContextMenu,
}: NoteButtonProps) {
  if (isRenaming) {
    return (
      <SidebarRenameInput
        value={note.title}
        className="tm-sidebar-rename-input tm-sidebar-rename-input--note"
        onCommit={(next) => {
          onRenameNote(note.id, normalizeRenameTitle(next, note.title))
          onCancelRename()
        }}
        onCancel={onCancelRename}
      />
    )
  }

  return (
    <button
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
        onStartRename()
      }}
      onContextMenu={onContextMenu}
      title={note.title}
    >
      <span className="tm-session-item-icon" aria-hidden="true">
        <IconNotes size={14} />
      </span>
      <span className="tm-session-item-label">{note.title}</span>
    </button>
  )
}

interface NotebookListProps {
  notebooks: NotebookItem[]
  notesByNotebook: Map<string, NoteItem[]>
  activeNoteId: string | null
  expandedNotebookIds: Set<string>
  renameTarget: { kind: 'notebook' | 'note'; id: string } | null
  sidebarEmptyHint: string
  onToggleExpanded: (notebookId: string) => void
  onCreateNote: (notebookId: string) => void
  onSelectNote: (noteId: string) => void
  onRenameNotebook: (notebookId: string, name: string) => void
  onRenameNote: (noteId: string, title: string) => void
  onStartRenameNotebook: (notebookId: string) => void
  onStartRenameNote: (noteId: string) => void
  onCancelRename: () => void
  onNotebookContextMenu: (event: React.MouseEvent, notebook: NotebookItem) => void
  onNoteContextMenu: (event: React.MouseEvent, note: NoteItem) => void
  onIngestNotebook?: (notebookId: string, notebookName: string) => void
}

export function NotesSidebarNotebookList({
  notebooks,
  notesByNotebook,
  activeNoteId,
  expandedNotebookIds,
  renameTarget,
  sidebarEmptyHint,
  onToggleExpanded,
  onCreateNote,
  onSelectNote,
  onRenameNotebook,
  onRenameNote,
  onStartRenameNotebook,
  onStartRenameNote,
  onCancelRename,
  onNotebookContextMenu,
  onNoteContextMenu,
}: NotebookListProps) {
  const { t } = useI18n()

  const activeNotebookId = notebooks.find((notebook) =>
    (notesByNotebook.get(notebook.id) ?? []).some((note) => note.id === activeNoteId),
  )?.id

  if (notebooks.length === 0) {
    return <div className="tm-empty">{sidebarEmptyHint}</div>
  }

  return (
    <>
      {notebooks.map((notebook) => {
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
                    onCancelRename()
                  }}
                  onCancel={onCancelRename}
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
                    onStartRenameNotebook(notebook.id)
                  }}
                  onContextMenu={(event) => onNotebookContextMenu(event, notebook)}
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
                notebookNotes.map((note) => (
                  <NotesSidebarNoteButton
                    key={note.id}
                    note={note}
                    isActive={activeNoteId === note.id}
                    isRenaming={renameTarget?.kind === 'note' && renameTarget.id === note.id}
                    onSelectNote={onSelectNote}
                    onRenameNote={onRenameNote}
                    onStartRename={() => onStartRenameNote(note.id)}
                    onCancelRename={onCancelRename}
                    onContextMenu={(event) => onNoteContextMenu(event, note)}
                  />
                ))
              ))}
          </div>
        )
      })}
    </>
  )
}
