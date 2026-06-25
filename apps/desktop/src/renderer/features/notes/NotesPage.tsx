import { useCallback, useEffect, useState } from 'react'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { useI18n } from '../../i18n/useI18n'
import { translateNotebookName } from '../../i18n/system-labels'
import { IconSliders } from '../../components/icons'
import type { MessageSettings } from '../chat/message-settings'
import { NotesEditor } from './NotesEditor'
import { NotesHeaderActions } from './NotesHeaderActions'
import { NotesSettingsModal } from './NotesSettingsModal'
import { exportNotesDataAsJson } from './notes-import-export'
import type { NotesData } from './notes-storage'
import {
  loadNotesEditorSettings,
  saveNotesEditorSettings,
  type NotesEditorSettings,
} from './notes-editor-settings'
import type { NoteItem, NotebookItem } from './notes-storage'
import { useLoroNoteSync } from './useLoroNoteSync'

interface Props {
  notebook: NotebookItem | null
  note: NoteItem | null
  notes: NoteItem[]
  syncFolderPath: string | null
  messageSettings: MessageSettings
  onUpdateNote: (noteId: string, patch: Partial<NoteItem>) => void
  onToggleStarred: (noteId: string) => void
  onToggleLocked: (noteId: string) => void
  onAddNoteTag: (noteId: string, tag: string) => void
  onRemoveNoteTag: (noteId: string, tag: string) => void
  onExportBackup: () => NotesData
  onImportBackup: (raw: string) => void
  onChatWithNote?: (noteId: string) => void
  onIngestNote?: (noteId: string, noteTitle: string) => void
  onSetSyncFolder: (path: string | null) => void
  onSelectNote: (noteId: string) => void
  onImportAttachment: (noteId: string, sourcePath: string) => Promise<{ absolutePath: string; name: string } | null>
}

export function NotesPage({
  notebook,
  note,
  notes,
  syncFolderPath,
  messageSettings,
  onUpdateNote,
  onToggleStarred,
  onToggleLocked,
  onAddNoteTag,
  onRemoveNoteTag,
  onExportBackup,
  onImportBackup,
  onChatWithNote,
  onIngestNote,
  onSetSyncFolder,
  onSelectNote,
  onImportAttachment,
}: Props) {
  const { t } = useI18n()
  const [editorSettings, setEditorSettings] = useState(loadNotesEditorSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    saveNotesEditorSettings(editorSettings)
  }, [editorSettings])

  const handleApplySettings = (settings: NotesEditorSettings, workingDirectory: string | null) => {
    setEditorSettings(settings)
    onSetSyncFolder(workingDirectory)
  }

  const handleRemoteContent = useCallback(
    (content: string) => {
      if (!note || note.content === content) return
      onUpdateNote(note.id, { content })
    },
    [note, onUpdateNote],
  )

  useLoroNoteSync({
    noteId: note?.id ?? null,
    content: note?.content ?? '',
    onRemoteContent: handleRemoteContent,
  })

  return (
    <ErrorBoundary title={t('errors.notes')}>
    <main className="tm-main tm-notes-page">
      <header className="tm-chat-header">
        <div className="tm-chat-breadcrumb">
          <span className="tm-model-pill tm-agent-pill tm-notes-notebook-pill">
            <span className="tm-agent-pill-label">
              {translateNotebookName(notebook?.name ?? t('notesPage.fallbackNotebook'), t)}
            </span>
          </span>
          {note ? (
            <span className="tm-module-breadcrumb-group">
              <span className="tm-chat-breadcrumb-sep">/</span>
              <span className="tm-model-pill tm-module-pill tm-module-pill--secondary" title={note.title}>
                {note.title}
              </span>
            </span>
          ) : null}
        </div>
        <div className="tm-chat-header-end">
          {note ? (
            <NotesHeaderActions
              note={note}
              onToggleStarred={onToggleStarred}
              onToggleLocked={onToggleLocked}
              onOpenSettings={() => setSettingsOpen(true)}
              onChatWithNote={onChatWithNote}
              onIngestNote={onIngestNote}
            />
          ) : (
            <button
              type="button"
              className="tm-chat-header-settings-btn"
              title={t('notesPage.settingsTitle')}
              onClick={() => setSettingsOpen(true)}
            >
              <IconSliders size={16} />
            </button>
          )}
        </div>
      </header>

      <div className="tm-module-content tm-notes-content">
        {note ? (
          <NotesEditor
            key={note.id}
            note={note}
            notes={notes}
            locked={note.locked}
            editorSettings={editorSettings}
            messageSettings={messageSettings}
            onUpdate={(patch) => onUpdateNote(note.id, patch)}
            onAddTag={onAddNoteTag}
            onRemoveTag={onRemoveNoteTag}
            onSelectNote={onSelectNote}
            onImportAttachment={(sourcePath) => onImportAttachment(note.id, sourcePath)}
            onToggleOutline={() =>
              setEditorSettings((settings) => ({
                ...settings,
                showOutline: !settings.showOutline,
              }))
            }
          />
        ) : (
          <div className="tm-module-empty">
            <h2 className="tm-module-empty-title">{t('notesPage.fallbackNotebook')}</h2>
            <p className="tm-module-empty-hint">{t('notesPage.emptyHint')}</p>
          </div>
        )}
      </div>

      {settingsOpen ? (
        <NotesSettingsModal
          settings={editorSettings}
          workingDirectory={syncFolderPath}
          onClose={() => setSettingsOpen(false)}
          onApply={handleApplySettings}
          onExportBackup={() => exportNotesDataAsJson(onExportBackup())}
          onImportBackup={onImportBackup}
        />
      ) : null}
    </main>
    </ErrorBoundary>
  )
}
