/** Notes rich editor helpers — facade re-exporting public API. */

export {
  editorHtmlToMarkdown,
  markdownToEditorHtml,
  normalizeEditorMarkdown,
} from './notes-rich-editor-markdown'

export {
  getMarkdownSelectionOffset,
  setMarkdownSelectionOffset,
} from './notes-rich-editor-selection'

export {
  queryNotesToolbarFormatState,
  type NotesToolbarFormatState,
} from './notes-rich-editor-toolbar-state'

export {
  insertRichImage,
  insertRichLink,
  richEditorIsEmpty,
  runRichToolbarAction,
  scrollRichEditorToLine,
  shouldRerenderEditorAfterAction,
} from './notes-rich-editor-actions'
