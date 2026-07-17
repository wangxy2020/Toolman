import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  queryNotesToolbarFormatState,
  type NotesToolbarFormatState,
} from './notes-rich-editor'
import { getNotesSlashCommands } from '../../i18n/notes-editor-labels'
import { useI18n } from '../../i18n/useI18n'
import { isGroupNotebookId } from '../group/group-note-utils'
import {
  countNoteCharacters,
  syncTextareaHeight,
} from './note-editor-utils'
import { markdownToBlocks } from './notes-blocks'
import type { NotesBodyEditorHandle } from './NotesRichBodyEditor'
import {
  resolveInitialPreviewMode,
  type NotesEditorSettings,
} from './notes-editor-settings'
import type { NoteToolbarActionKey } from './NotesEditorToolbar'
import type { NotesEditorPreviewMode } from './notes-editor-types'
import { toggleNoteTaskLine } from './notes-editor-types'
import { extractNoteOutline, type NoteOutlineItem } from './notes-outline'
import type { NoteItem } from './notes-storage'
import { useNotesEditorHistory } from './useNotesEditorHistory'
import { useNotesEditorKeyboard } from './useNotesEditorKeyboard'
import { useNotesEditorSlash } from './useNotesEditorSlash'

type UseNotesEditorParams = {
  note: NoteItem
  notes: NoteItem[]
  locked: boolean
  editorSettings: NotesEditorSettings
  onUpdate: (patch: Partial<NoteItem>) => void
  onSelectNote: (noteId: string) => void
  onImportAttachment?: (sourcePath: string) => Promise<{ absolutePath: string; name: string } | null>
}

export function useNotesEditor({
  note,
  notes,
  locked,
  editorSettings,
  onUpdate,
  onSelectNote,
  onImportAttachment,
}: UseNotesEditorParams) {
  const { t } = useI18n()
  const slashCommands = useMemo(() => getNotesSlashCommands(t), [t])
  const previewModeLabels = useMemo(
    (): Record<NotesEditorPreviewMode, string> => ({
      edit: t('notesPage.openModes.editOnly'),
      split: t('notesPage.openModes.livePreview'),
      preview: t('notesPage.openModes.preview'),
    }),
    [t],
  )

  const bodyRef = useRef<NotesBodyEditorHandle>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const editPaneRef = useRef<HTMLDivElement>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)

  const [previewMode, setPreviewMode] = useState<NotesEditorPreviewMode>(() =>
    resolveInitialPreviewMode(editorSettings),
  )
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [formatState, setFormatState] = useState<NotesToolbarFormatState>(() =>
    queryNotesToolbarFormatState(null),
  )

  const refreshFormatState = useCallback(() => {
    setFormatState(queryNotesToolbarFormatState(bodyRef.current?.getRootElement() ?? null))
  }, [])

  useEffect(() => {
    const onSelectionChange = () => refreshFormatState()
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [refreshFormatState])

  const history = useNotesEditorHistory({
    noteTitle: note.title,
    noteContent: note.content,
    locked,
    onUpdate,
  })

  const slash = useNotesEditorSlash({
    bodyRef,
    noteContent: note.content,
    slashCommands,
    locked,
    onContentChange: history.handleContentChange,
    onImportAttachment,
    markSkipHistory: history.markSkipHistory,
    onUpdate,
  })

  useEffect(() => {
    if (locked) {
      setPreviewMode('preview')
    } else if (isGroupNotebookId(note.notebookId)) {
      setPreviewMode('edit')
    } else {
      setPreviewMode(resolveInitialPreviewMode(editorSettings))
    }
    history.resetHistory()
    slash.setSlashMenuOpen(false)
  }, [note.id, editorSettings, locked, note.notebookId, history.resetHistory, slash.setSlashMenuOpen])

  const syncTitleHeight = useCallback(() => {
    const title = titleRef.current
    if (!title) return
    syncTextareaHeight(title)
  }, [])

  useEffect(() => {
    syncTitleHeight()
  }, [note.title, syncTitleHeight])

  useEffect(() => {
    const title = titleRef.current
    const pane = editPaneRef.current
    if (!title || !pane) return

    const observer = new ResizeObserver(() => {
      syncTitleHeight()
    })
    observer.observe(pane)
    return () => observer.disconnect()
  }, [syncTitleHeight])

  useEffect(() => {
    if (!modeMenuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!modeMenuRef.current?.contains(event.target as Node)) {
        setModeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [modeMenuOpen])

  const handleBodyChange = useCallback(
    (value: string) => {
      history.handleContentChange(value)
      const editor = bodyRef.current
      if (!editor) return
      slash.updateSlashMenu(value, editor.getSelectionOffset())
    },
    [bodyRef, history, slash],
  )

  const handleUndo = useCallback(() => {
    if (!history.handleUndo()) return
    slash.setSlashMenuOpen(false)
  }, [history, slash])

  const handleRedo = useCallback(() => {
    if (!history.handleRedo()) return
    slash.setSlashMenuOpen(false)
  }, [history, slash])

  const handleToolbarAction = useCallback(
    (key: NoteToolbarActionKey, options?: { fontSizePx?: number }) => {
      slash.handleToolbarAction(key, options)
      requestAnimationFrame(() => refreshFormatState())
    },
    [refreshFormatState, slash],
  )

  const handleBodyKeyDown = useNotesEditorKeyboard({
    locked,
    slashMenuOpen: slash.slashMenuOpen,
    slashCandidates: slash.slashCandidates,
    slashActiveIndex: slash.slashActiveIndex,
    setSlashActiveIndex: slash.setSlashActiveIndex,
    setSlashMenuOpen: slash.setSlashMenuOpen,
    runSlashCommand: slash.runSlashCommand,
    handleUndo,
    handleRedo,
    handleToolbarAction,
    runLink: slash.runLink,
  })

  const handleToggleTask = useCallback(
    (lineIndex: number, checked: boolean) => {
      if (locked) return
      const next = toggleNoteTaskLine(note.content.split('\n'), lineIndex, checked)
      if (next != null && next !== note.content) onUpdate({ content: next })
    },
    [locked, note.content, onUpdate],
  )

  const blockItems =
    (note.blocks?.length ?? 0) > 0 ? note.blocks! : markdownToBlocks(note.content ?? '')

  const outlineItems = useMemo(
    () =>
      extractNoteOutline(note.title, note.content, {
        blocks: blockItems,
        editorMode: note.editorMode,
      }),
    [blockItems, note.content, note.editorMode, note.title],
  )

  const handleOutlineSelect = useCallback((item: NoteOutlineItem) => {
    if (item.target === 'title') {
      const title = titleRef.current
      if (!title) return
      title.focus()
      title.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (item.target === 'block' && item.blockId) {
      const block = editPaneRef.current?.querySelector<HTMLElement>(
        `[data-block-id="${item.blockId}"]`,
      )
      block?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      block?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
      return
    }

    if (item.lineIndex >= 0 && bodyRef.current) {
      bodyRef.current.scrollToLine(item.lineIndex)
      return
    }

    const heading = previewPaneRef.current?.querySelector<HTMLElement>(`#${item.id}`)
    heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return {
    t,
    bodyRef,
    titleRef,
    editPaneRef,
    previewPaneRef,
    modeMenuRef,
    previewMode,
    setPreviewMode,
    previewModeLabels,
    modeMenuOpen,
    setModeMenuOpen,
    past: history.past,
    future: history.future,
    slashMenuOpen: slash.slashMenuOpen,
    setSlashMenuOpen: slash.setSlashMenuOpen,
    slashActiveIndex: slash.slashActiveIndex,
    setSlashActiveIndex: slash.setSlashActiveIndex,
    slashCandidates: slash.slashCandidates,
    charCount: countNoteCharacters(note.title, note.content),
    blockItems,
    outlineItems,
    showEditor: previewMode === 'edit' || previewMode === 'split',
    showPreview: previewMode === 'preview' || previewMode === 'split',
    handleTitleChange: history.handleTitleChange,
    handleBodyChange,
    handleBodyKeyDown,
    handleToolbarAction,
    formatState,
    refreshFormatState,
    handleUndo,
    handleRedo,
    handleToggleTask,
    handleOutlineSelect,
    runImage: slash.runImage,
    runLink: slash.runLink,
    updateSlashMenu: slash.updateSlashMenu,
    runSlashCommand: slash.runSlashCommand,
    notes,
    onSelectNote,
    note,
    locked,
    editorSettings,
  }
}
