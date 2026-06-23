import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronDown } from '../../components/icons'
import {
  InputPopupMenu,
  InputPopupMenuList,
} from '../chat/InputPopupMenu'
import type { MessageSettings } from '../chat/message-settings'
import { countNoteCharacters, detectSlashQuery, scrollTextareaToLine, syncTextareaHeight } from './note-editor-utils'
import {
  filterNotesSlashCommands,
  NOTES_SLASH_COMMANDS,
  type NotesSlashCommandItem,
} from './notes-slash-commands'
import { markdownToBlocks } from './notes-blocks'
import { NotesBlockEditor } from './NotesBlockEditor'
import { NotesInteractivePreview } from './NotesInteractivePreview'
import { NotesEditorToolbar, type NoteToolbarActionKey } from './NotesEditorToolbar'
import { NotesOutlinePanel } from './NotesOutlinePanel'
import { extractNoteOutline, type NoteOutlineItem } from './notes-outline'
import {
  resolveInitialPreviewMode,
  type NotesEditorSettings,
} from './notes-editor-settings'
import type { NoteItem } from './notes-storage'
import { isGroupNotebookId } from '../group/group-note-utils'
import { NotesTagsEditor } from './NotesTagsEditor'
import { useNoteEditorActions } from './useNoteEditorActions'

type PreviewMode = 'edit' | 'preview'

type EditorSnapshot = {
  title: string
  content: string
}

const PREVIEW_MODE_LABELS: Record<PreviewMode, string> = {
  edit: '仅编辑',
  preview: '实时预览',
}

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
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const editPaneRef = useRef<HTMLDivElement>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null)
  const [previewMode, setPreviewMode] = useState<PreviewMode>(() =>
    resolveInitialPreviewMode(editorSettings),
  )
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const [past, setPast] = useState<EditorSnapshot[]>([])
  const [future, setFuture] = useState<EditorSnapshot[]>([])
  const skipHistoryRef = useRef(false)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [slashReplaceStart, setSlashReplaceStart] = useState(0)

  const pushHistorySnapshot = useCallback(() => {
    setPast((prev) => [...prev.slice(-49), { title: note.title, content: note.content }])
    setFuture([])
  }, [note.content, note.title])

  const handleContentChange = useCallback(
    (value: string) => {
      if (locked) return
      if (!skipHistoryRef.current) {
        pushHistorySnapshot()
      } else {
        skipHistoryRef.current = false
      }
      onUpdate({ content: value })
    },
    [locked, onUpdate, pushHistorySnapshot],
  )

  const { runAction, runSlashAction, runImage, runLink } = useNoteEditorActions({
    bodyRef,
    disabled: locked,
    onContentChange: handleContentChange,
    importAttachment: onImportAttachment,
  })

  useEffect(() => {
    if (locked) {
      setPreviewMode('preview')
    } else if (isGroupNotebookId(note.notebookId)) {
      setPreviewMode('edit')
    } else {
      setPreviewMode(resolveInitialPreviewMode(editorSettings))
    }
    setPast([])
    setFuture([])
    setSlashMenuOpen(false)
  }, [note.id, editorSettings, locked, note.notebookId])

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

  const applySnapshot = useCallback(
    (snapshot: EditorSnapshot) => {
      skipHistoryRef.current = true
      onUpdate(snapshot)
    },
    [onUpdate],
  )

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

  const slashCandidates = useMemo(() => {
    if (!slashMenuOpen) return []
    const textarea = bodyRef.current
    if (!textarea) return NOTES_SLASH_COMMANDS
    const detected = detectSlashQuery(note.content, textarea.selectionStart)
    if (!detected) return NOTES_SLASH_COMMANDS
    return filterNotesSlashCommands(detected.query)
  }, [note.content, slashMenuOpen])

  useEffect(() => {
    if (!slashMenuOpen) return
    setSlashActiveIndex(0)
  }, [slashCandidates.length, slashMenuOpen])

  const updateSlashMenu = useCallback(
    (value: string, cursor: number) => {
      const detected = detectSlashQuery(value, cursor)
      if (detected) {
        setSlashReplaceStart(detected.replaceStart)
        setSlashMenuOpen(true)
        return
      }
      setSlashMenuOpen(false)
    },
    [],
  )

  const removeSlashToken = useCallback(() => {
    const textarea = bodyRef.current
    if (!textarea) return
    const cursor = textarea.selectionStart
    const next = `${note.content.slice(0, slashReplaceStart)}${note.content.slice(cursor)}`
    skipHistoryRef.current = true
    onUpdate({ content: next })
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(slashReplaceStart, slashReplaceStart)
    })
  }, [note.content, onUpdate, slashReplaceStart])

  const runSlashCommand = useCallback(
    async (item: NotesSlashCommandItem) => {
      setSlashMenuOpen(false)
      removeSlashToken()
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
      if (item.action === 'image') {
        await runImage()
        return
      }
      if (item.action === 'link') {
        runLink()
        return
      }
      runSlashAction(item.action)
    },
    [removeSlashToken, runImage, runLink, runSlashAction],
  )

  const charCount = useMemo(
    () => countNoteCharacters(note.title, note.content),
    [note.title, note.content],
  )

  const handleTitleChange = useCallback(
    (value: string) => {
      if (locked) return
      if (!skipHistoryRef.current) {
        pushHistorySnapshot()
      } else {
        skipHistoryRef.current = false
      }
      onUpdate({ title: value })
    },
    [locked, onUpdate, pushHistorySnapshot],
  )

  const handleBodyChange = useCallback(
    (value: string) => {
      handleContentChange(value)
      const textarea = bodyRef.current
      if (!textarea) return
      updateSlashMenu(value, textarea.selectionStart)
    },
    [handleContentChange, updateSlashMenu],
  )

  const handleUndo = useCallback(() => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast((items) => items.slice(0, -1))
    setFuture((items) => [{ title: note.title, content: note.content }, ...items])
    applySnapshot(previous)
    setSlashMenuOpen(false)
  }, [applySnapshot, note.content, note.title, past])

  const handleRedo = useCallback(() => {
    const next = future[0]
    if (!next) return
    setFuture((items) => items.slice(1))
    setPast((items) => [...items, { title: note.title, content: note.content }])
    applySnapshot(next)
    setSlashMenuOpen(false)
  }, [applySnapshot, future, note.content, note.title])

  const handleToolbarAction = useCallback(
    (key: NoteToolbarActionKey) => {
      if (!runAction(key)) return
      setSlashMenuOpen(false)
    },
    [runAction],
  )

  const handleBodyKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashMenuOpen && slashCandidates.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSlashActiveIndex((index) => (index + 1) % slashCandidates.length)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSlashActiveIndex(
            (index) => (index - 1 + slashCandidates.length) % slashCandidates.length,
          )
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const item = slashCandidates[slashActiveIndex]
          if (item) void runSlashCommand(item)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setSlashMenuOpen(false)
          return
        }
      }

      const mod = event.metaKey || event.ctrlKey
      if (!mod || locked) return

      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault()
        handleRedo()
        return
      }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        handleUndo()
        return
      }
      if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        handleRedo()
        return
      }

      const shortcutMap: Record<string, NoteToolbarActionKey> = {
        b: 'bold',
        i: 'italic',
        u: 'underline',
      }
      const action = shortcutMap[event.key.toLowerCase()]
      if (action) {
        event.preventDefault()
        handleToolbarAction(action)
        return
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        runLink()
      }
    },
    [
      handleRedo,
      handleToolbarAction,
      handleUndo,
      locked,
      runLink,
      runSlashCommand,
      slashActiveIndex,
      slashCandidates,
      slashMenuOpen,
    ],
  )

  const handleToggleTask = useCallback(
    (lineIndex: number, checked: boolean) => {
      if (locked) return
      const lines = note.content.split('\n')
      let taskCounter = -1
      for (let i = 0; i < lines.length; i++) {
        if (!/^- \[[ xX]\] /.test(lines[i])) continue
        taskCounter += 1
        if (taskCounter !== lineIndex) continue
        lines[i] = checked
          ? lines[i].replace(/^- \[ \] /, '- [x] ')
          : lines[i].replace(/^- \[[xX]\] /, '- [ ] ')
        break
      }
      const next = lines.join('\n')
      if (next !== note.content) onUpdate({ content: next })
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

  const handleOutlineSelect = useCallback(
    (item: NoteOutlineItem) => {
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
    },
    [],
  )

  const showEditor = previewMode === 'edit'
  const showPreview = previewMode === 'preview'

  return (
    <div
      className="tm-notes-editor"
      style={{ ['--tm-notes-font-size' as string]: `${editorSettings.fontSize}px` }}
    >
      <NotesEditorToolbar
        bodyRef={bodyRef}
        disabled={locked}
        onRunAction={handleToolbarAction}
        onRunImage={runImage}
        onRunLink={runLink}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        showOutline={editorSettings.showOutline}
        onToggleOutline={onToggleOutline}
      />

      <div className="tm-notes-editor-layout">
        <div className="tm-notes-editor-main">
        {showEditor ? (
          <div
            ref={editPaneRef}
            className={[
              'tm-notes-editor-pane tm-notes-editor-pane--edit tm-notes-editor-pane--slash',
              editorSettings.narrowColumn ? 'tm-notes-editor-pane--narrow' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="tm-notes-editor-title-wrap">
              <textarea
                ref={titleRef}
                className="tm-notes-editor-title"
                value={note.title}
                readOnly={locked}
                placeholder="无标题"
                rows={1}
                cols={1}
                onChange={(event) => {
                  handleTitleChange(event.target.value)
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
                blocks={blockItems}
                locked={locked}
                onChange={(blocks) => onUpdate({ blocks, editorMode: 'blocks' })}
              />
            ) : (
              <textarea
                ref={bodyRef}
                className="tm-notes-editor-body"
                value={note.content}
                readOnly={locked}
                placeholder="输入'/'调用命令"
                onChange={(event) => handleBodyChange(event.target.value)}
                onKeyDown={handleBodyKeyDown}
                onClick={() => {
                  const textarea = bodyRef.current
                  if (!textarea) return
                  updateSlashMenu(note.content, textarea.selectionStart)
                }}
              />
            )}
            <InputPopupMenu
              title="笔记命令"
              open={slashMenuOpen && slashCandidates.length > 0}
              onClose={() => setSlashMenuOpen(false)}
            >
              <InputPopupMenuList
                items={slashCandidates.map((item) => ({
                  id: item.id,
                  command: item.command,
                  description: item.description,
                  showIcon: false,
                }))}
                activeIndex={slashActiveIndex}
                onActiveIndexChange={setSlashActiveIndex}
                onSelect={(index) => {
                  const item = slashCandidates[index]
                  if (item) void runSlashCommand(item)
                }}
              />
            </InputPopupMenu>
          </div>
        ) : null}

        {showPreview ? (
          <div
            ref={previewPaneRef}
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
              onToggleTask={handleToggleTask}
            />
          </div>
        ) : null}
        </div>

        {editorSettings.showOutline ? (
          <NotesOutlinePanel items={outlineItems} onSelect={handleOutlineSelect} />
        ) : null}
      </div>

      <footer className="tm-notes-statusbar">
        <span className="tm-notes-statusbar-count">字符: {charCount}</span>
        <div className="tm-notes-statusbar-mode" ref={modeMenuRef}>
          <button
            type="button"
            className="tm-notes-statusbar-mode-btn"
            onClick={() => setModeMenuOpen((open) => !open)}
          >
            <span className="tm-notes-statusbar-mode-icon">A</span>
            <span>{PREVIEW_MODE_LABELS[previewMode]}</span>
            <IconChevronDown size={12} className="tm-notes-statusbar-mode-chevron" />
          </button>
          {modeMenuOpen ? (
            <div className="tm-notes-statusbar-mode-menu" role="menu">
              {(Object.keys(PREVIEW_MODE_LABELS) as PreviewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={previewMode === mode}
                  className={[
                    'tm-notes-statusbar-mode-item',
                    previewMode === mode ? 'tm-notes-statusbar-mode-item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setPreviewMode(mode)
                    setModeMenuOpen(false)
                  }}
                >
                  {PREVIEW_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
