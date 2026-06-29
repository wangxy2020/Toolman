import { IconChevronDown } from '../../components/icons'
import {
  InputPopupMenu,
  InputPopupMenuList,
} from '../chat/InputPopupMenu'
import type { MessageSettings } from '../chat/message-settings'
import { NotesBlockEditor } from './NotesBlockEditor'
import { NotesInteractivePreview } from './NotesInteractivePreview'
import { NotesEditorToolbar } from './NotesEditorToolbar'
import { NotesOutlinePanel } from './NotesOutlinePanel'
import type { NotesEditorSettings } from './notes-editor-settings'
import type { NotesEditorPreviewMode } from './notes-editor-types'
import type { NoteItem } from './notes-storage'
import { syncTextareaHeight } from './note-editor-utils'
import { NotesTagsEditor } from './NotesTagsEditor'
import { useNotesEditor } from './useNotesEditor'

interface Props {
  note: NoteItem
  notes: NoteItem[]
  locked: boolean
  editorSettings: NotesEditorSettings
  messageSettings: MessageSettings
  onUpdate: (patch: Partial<NoteItem>) => void
  onAddTag: (noteId: string, tag: string) => void
  onRemoveTag: (noteId: string, tag: string) => void
  onSelectNote: (noteId: string) => void
  onImportAttachment?: (sourcePath: string) => Promise<{ absolutePath: string; name: string } | null>
  onToggleOutline?: () => void
}

export function NotesEditor({
  note,
  notes,
  locked,
  editorSettings,
  messageSettings,
  onUpdate,
  onAddTag,
  onRemoveTag,
  onSelectNote,
  onImportAttachment,
  onToggleOutline,
}: Props) {
  const editor = useNotesEditor({
    note,
    notes,
    locked,
    editorSettings,
    onUpdate,
    onSelectNote,
    onImportAttachment,
  })

  return (
    <div
      className="tm-notes-editor"
      style={{ ['--tm-notes-font-size' as string]: `${editorSettings.fontSize}px` }}
    >
      <NotesEditorToolbar
        bodyRef={editor.bodyRef}
        disabled={locked}
        onRunAction={editor.handleToolbarAction}
        onRunImage={editor.runImage}
        onRunLink={editor.runLink}
        onUndo={editor.handleUndo}
        onRedo={editor.handleRedo}
        canUndo={editor.past.length > 0}
        canRedo={editor.future.length > 0}
        showOutline={editorSettings.showOutline}
        onToggleOutline={onToggleOutline}
      />

      <div className="tm-notes-editor-layout">
        <div className="tm-notes-editor-main">
        {editor.showEditor ? (
          <div
            ref={editor.editPaneRef}
            className={[
              'tm-notes-editor-pane tm-notes-editor-pane--edit tm-notes-editor-pane--slash',
              editorSettings.narrowColumn ? 'tm-notes-editor-pane--narrow' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="tm-notes-editor-title-wrap">
              <textarea
                ref={editor.titleRef}
                className="tm-notes-editor-title"
                value={note.title}
                readOnly={locked}
                placeholder={editor.t('notesPage.editor.untitled')}
                rows={1}
                cols={1}
                onChange={(event) => {
                  editor.handleTitleChange(event.target.value)
                  syncTextareaHeight(event.target)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                  }
                }}
              />
            </div>
            {!locked ? (
              <NotesTagsEditor note={note} onAddTag={onAddTag} onRemoveTag={onRemoveTag} />
            ) : (note.tags ?? []).length > 0 ? (
              <div className="tm-notes-tags-editor tm-notes-tags-editor--readonly">
                <div className="tm-notes-tags">
                  {(note.tags ?? []).map((tag) => (
                    <span key={tag} className="tm-notes-tag tm-notes-tag--readonly">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {note.editorMode === 'blocks' ? (
              <NotesBlockEditor
                blocks={editor.blockItems}
                locked={locked}
                onChange={(blocks) => onUpdate({ blocks, editorMode: 'blocks' })}
              />
            ) : (
              <textarea
                ref={editor.bodyRef}
                className="tm-notes-editor-body"
                value={note.content}
                readOnly={locked}
                placeholder={editor.t('notesPage.editor.slashPlaceholder')}
                onChange={(event) => editor.handleBodyChange(event.target.value)}
                onKeyDown={editor.handleBodyKeyDown}
                onClick={() => {
                  const textarea = editor.bodyRef.current
                  if (!textarea) return
                  editor.updateSlashMenu(note.content, textarea.selectionStart)
                }}
              />
            )}
            <InputPopupMenu
              title={editor.t('notesPage.editor.commandsTitle')}
              open={editor.slashMenuOpen && editor.slashCandidates.length > 0}
              onClose={() => editor.setSlashMenuOpen(false)}
            >
              <InputPopupMenuList
                items={editor.slashCandidates.map((item) => ({
                  id: item.id,
                  command: item.command,
                  description: item.description,
                  showIcon: false,
                }))}
                activeIndex={editor.slashActiveIndex}
                onActiveIndexChange={editor.setSlashActiveIndex}
                onSelect={(index) => {
                  const item = editor.slashCandidates[index]
                  if (item) void editor.runSlashCommand(item)
                }}
              />
            </InputPopupMenu>
          </div>
        ) : null}

        {editor.showPreview ? (
          <div
            ref={editor.previewPaneRef}
            className={[
              'tm-notes-editor-pane tm-notes-editor-pane--preview',
              editorSettings.narrowColumn ? 'tm-notes-editor-pane--narrow' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <NotesInteractivePreview
              title={note.title}
              content={note.content}
              notes={notes}
              messageSettings={messageSettings}
              onNavigateNote={onSelectNote}
              onToggleTask={editor.handleToggleTask}
            />
          </div>
        ) : null}
        </div>

        {editorSettings.showOutline ? (
          <NotesOutlinePanel items={editor.outlineItems} onSelect={editor.handleOutlineSelect} />
        ) : null}
      </div>

      <footer className="tm-notes-statusbar">
        <span className="tm-notes-statusbar-count">
          {editor.t('notesPage.editor.charCount', { count: editor.charCount })}
        </span>
        <div className="tm-notes-statusbar-mode" ref={editor.modeMenuRef}>
          <button
            type="button"
            className="tm-notes-statusbar-mode-btn"
            onClick={() => editor.setModeMenuOpen((open) => !open)}
          >
            <span className="tm-notes-statusbar-mode-icon">A</span>
            <span>{editor.previewModeLabels[editor.previewMode]}</span>
            <IconChevronDown size={12} className="tm-notes-statusbar-mode-chevron" />
          </button>
          {editor.modeMenuOpen ? (
            <div className="tm-notes-statusbar-mode-menu" role="menu">
              {(Object.keys(editor.previewModeLabels) as NotesEditorPreviewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={editor.previewMode === mode}
                  className={[
                    'tm-notes-statusbar-mode-item',
                    editor.previewMode === mode ? 'tm-notes-statusbar-mode-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    editor.setPreviewMode(mode)
                    editor.setModeMenuOpen(false)
                  }}
                >
                  {editor.previewModeLabels[mode]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
