import { useMemo } from 'react'

import { IconPlus } from '../../components/icons'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { collectAllTags } from './notes-search'
import type { NoteItem, NotebookItem } from './notes-storage'
import { NotesSidebarDialogs, useNotesSidebarState } from './NotesSidebarDialogs'
import { NotesSidebarNotebookList } from './NotesSidebarNotebookList'
import { NotesSidebarFilterHint, NotesSidebarTags } from './NotesSidebarTags'

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
  const state = useNotesSidebarState()

  const allNotes = useMemo(
    () => notebooks.flatMap((notebook) => notesByNotebook.get(notebook.id) ?? []),
    [notebooks, notesByNotebook],
  )
  const tags = useMemo(() => collectAllTags(allNotes), [allNotes])

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={onCreateNotebook}>
          <IconPlus />
          {config.addLabel}
        </button>

        <NotesSidebarTags
          tags={tags}
          activeTagFilter={activeTagFilter}
          onTagFilterChange={onTagFilterChange}
        />

        <NotesSidebarFilterHint
          searchQuery={searchQuery}
          activeTagFilter={activeTagFilter}
          onClear={() => {
            onSearchQueryChange('')
            onTagFilterChange(null)
          }}
        />

        <div className="tm-sidebar-list">
          <NotesSidebarNotebookList
            notebooks={notebooks}
            notesByNotebook={notesByNotebook}
            activeNoteId={activeNoteId}
            expandedNotebookIds={expandedNotebookIds}
            renameTarget={state.renameTarget}
            sidebarEmptyHint={config.sidebarEmptyHint}
            onToggleExpanded={onToggleExpanded}
            onCreateNote={onCreateNote}
            onSelectNote={onSelectNote}
            onRenameNotebook={onRenameNotebook}
            onRenameNote={onRenameNote}
            onStartRenameNotebook={(id) => state.setRenameTarget({ kind: 'notebook', id })}
            onStartRenameNote={(id) => state.setRenameTarget({ kind: 'note', id })}
            onCancelRename={() => state.setRenameTarget(null)}
            onNotebookContextMenu={(event, notebook) => {
              event.preventDefault()
              const canDelete = !notebook.isDefault
              const canIngest = Boolean(onIngestNotebook)
              if (!canDelete && !canIngest) return
              state.setNotebookContextMenu({
                x: event.clientX,
                y: event.clientY,
                notebook,
              })
            }}
            onNoteContextMenu={(event, note) => {
              event.preventDefault()
              state.setNoteContextMenu({
                x: event.clientX,
                y: event.clientY,
                note,
              })
            }}
          />
        </div>
      </div>

      <NotesSidebarDialogs
        state={state}
        onDeleteNote={onDeleteNote}
        onDeleteNotebook={onDeleteNotebook}
        onIngestNotebook={onIngestNotebook}
        onIngestNote={onIngestNote}
      />
    </aside>
  )
}
