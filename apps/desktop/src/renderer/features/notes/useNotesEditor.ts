import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getNotesSlashCommands } from '../../i18n/notes-editor-labels'
import { useI18n } from '../../i18n/useI18n'
import { isGroupNotebookId } from '../group/group-note-utils'
import {
  countNoteCharacters,
  scrollTextareaToLine,
  syncTextareaHeight,
} from './note-editor-utils'
import { markdownToBlocks } from './notes-blocks'
import {
  resolveInitialPreviewMode,
  type NotesEditorSettings,
} from './notes-editor-settings'
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
      preview: t('notesPage.openModes.livePreview'),
    }),
    [t],
  )

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const editPaneRef = useRef<HTMLDivElement>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)

  const [previewMode, setPreviewMode] = useState<NotesEditorPreviewMode>(() =>
    resolveInitialPreviewMode(editorSettings),
  )
  const [modeMenuOpen, setModeMenuOpen] = useState(false)

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
      const textarea = bodyRef.current
      if (!textarea) return
      slash.updateSlashMenu(value, textarea.selectionStart)
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
    (key: Parameters<typeof slash.handleToolbarAction>[0]) => {
      slash.handleToolbarAction(key)
    },
    [slash],
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
      scrollTextareaToLine(bodyRef.current, item.lineIndex)
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
    showEditor: previewMode === 'edit',
    showPreview: previewMode === 'preview',
    handleTitleChange: history.handleTitleChange,
    handleBodyChange,
    handleBodyKeyDown,
    handleToolbarAction,
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
