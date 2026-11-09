import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  editorHtmlToMarkdown,
  getMarkdownSelectionOffset,
  handleTaskListKeyDown,
  hydrateNoteEditorImages,
  insertRichImage,
  insertRichLink,
  markdownToEditorHtml,
  normalizeEditorMarkdown,
  richEditorIsEmpty,
  runRichToolbarAction,
  scrollRichEditorToLine,
  setMarkdownSelectionOffset,
  shouldRerenderEditorAfterAction,
} from './notes-rich-editor'
import type { NoteToolbarActionKey } from './NotesEditorToolbar'

export interface NotesBodyEditorHandle {
  focus: () => void
  getMarkdown: () => string
  getSelectionOffset: () => number
  setSelectionOffset: (offset: number) => void
  scrollToLine: (lineIndex: number) => void
  runAction: (key: NoteToolbarActionKey, options?: { fontSizePx?: number }) => boolean
  getRootElement: () => HTMLElement | null
  insertImage: (filePath: string, alt?: string) => Promise<void>
  insertLink: (url: string) => void
}

interface Props {
  value: string
  readOnly?: boolean
  placeholder?: string
  className?: string
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  onSelectionChange?: () => void
}

export const NotesRichBodyEditor = forwardRef<NotesBodyEditorHandle, Props>(
  function NotesRichBodyEditor(
    { value, readOnly = false, placeholder, className, onChange, onKeyDown, onSelectionChange },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null)
    const focusedRef = useRef(false)
    const lastEmittedRef = useRef(value)
    const lastRenderedRef = useRef(value)
    const [isEmpty, setIsEmpty] = useState(() => !value.trim())

    const emitMarkdown = (markdown: string) => {
      lastEmittedRef.current = markdown
      lastRenderedRef.current = markdown
      setIsEmpty(!markdown.trim())
      onChange(markdown)
    }

    const syncFromMarkdown = (markdown: string) => {
      const root = rootRef.current
      if (!root) return
      const normalized = normalizeEditorMarkdown(markdown)
      lastRenderedRef.current = normalized
      root.innerHTML = markdownToEditorHtml(normalized)
      setIsEmpty(richEditorIsEmpty(root))
      void hydrateNoteEditorImages(root)
    }

    useLayoutEffect(() => {
      syncFromMarkdown(value)
      lastEmittedRef.current = value
    }, [])

    useImperativeHandle(ref, () => ({
      focus: () => rootRef.current?.focus(),
      getMarkdown: () => {
        const root = rootRef.current
        return root ? editorHtmlToMarkdown(root) : value
      },
      getSelectionOffset: () => {
        const root = rootRef.current
        return root ? getMarkdownSelectionOffset(root) : 0
      },
      setSelectionOffset: (offset: number) => {
        const root = rootRef.current
        if (root) setMarkdownSelectionOffset(root, offset)
      },
      scrollToLine: (lineIndex: number) => {
        const root = rootRef.current
        if (root) scrollRichEditorToLine(root, lineIndex)
      },
      runAction: (key: NoteToolbarActionKey, options?: { fontSizePx?: number }) => {
        const root = rootRef.current
        if (!root) return false
        const changed = runRichToolbarAction(root, key, options)
        if (!changed) return false
        const markdown = editorHtmlToMarkdown(root)
        lastEmittedRef.current = markdown
        lastRenderedRef.current = markdown
        setIsEmpty(!markdown.trim())
        if (shouldRerenderEditorAfterAction(key)) {
          const offset = getMarkdownSelectionOffset(root)
          syncFromMarkdown(markdown)
          setMarkdownSelectionOffset(root, offset)
        }
        onChange(markdown)
        onSelectionChange?.()
        return true
      },
      getRootElement: () => rootRef.current,
      insertImage: async (filePath: string, alt?: string) => {
        const root = rootRef.current
        if (!root) return
        await insertRichImage(root, filePath, alt)
        const markdown = editorHtmlToMarkdown(root)
        lastEmittedRef.current = markdown
        lastRenderedRef.current = markdown
        setIsEmpty(!markdown.trim())
        onChange(markdown)
      },
      insertLink: (url: string) => {
        const root = rootRef.current
        if (!root) return
        insertRichLink(root, url)
        const markdown = editorHtmlToMarkdown(root)
        lastEmittedRef.current = markdown
        lastRenderedRef.current = markdown
        setIsEmpty(!markdown.trim())
        onChange(markdown)
      },
    }))

    useEffect(() => {
      if (value === lastEmittedRef.current) return
      // External updates (undo/redo/sync) must replace the DOM even while focused.
      // Only skip when the parent echoes the same markdown we already rendered.
      if (focusedRef.current && value === lastRenderedRef.current) return
      syncFromMarkdown(value)
      lastEmittedRef.current = value
    }, [value])

    const handleInput = () => {
      const root = rootRef.current
      if (!root) return
      emitMarkdown(editorHtmlToMarkdown(root))
    }

    const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
      if (readOnly) return
      event.preventDefault()
      const text = event.clipboardData.getData('text/plain')
      if (!text) return
      const root = rootRef.current
      if (!root) return
      const selection = window.getSelection()
      if (!selection?.rangeCount) return
      const range = selection.getRangeAt(0)
      range.deleteContents()
      const node = document.createTextNode(text)
      range.insertNode(node)
      range.setStartAfter(node)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      emitMarkdown(editorHtmlToMarkdown(root))
      onSelectionChange?.()
    }

    const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
      if (readOnly) {
        onSelectionChange?.()
        return
      }
      const target = event.target
      const check =
        target instanceof HTMLElement
          ? target.closest('.tm-notes-task-check, input[type="checkbox"]')
          : null
      if (check instanceof HTMLElement) {
        event.preventDefault()
        const item = check.closest('li.tm-notes-task-item')
        if (item instanceof HTMLElement) {
          const nextChecked = item.getAttribute('data-checked') !== 'true'
          item.setAttribute('data-checked', nextChecked ? 'true' : 'false')
          if (check.classList.contains('tm-notes-task-check')) {
            check.setAttribute('aria-checked', nextChecked ? 'true' : 'false')
          } else if (check instanceof HTMLInputElement) {
            check.checked = nextChecked
          }
          handleInput()
        }
      }
      onSelectionChange?.()
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!readOnly) {
        const root = rootRef.current
        if (root && handleTaskListKeyDown(root, event.nativeEvent)) {
          emitMarkdown(editorHtmlToMarkdown(root))
          onSelectionChange?.()
          return
        }
      }
      onKeyDown?.(event)
    }

    return (
      <div
        ref={rootRef}
        className={[
          'tm-notes-editor-body',
          'tm-notes-rich-body',
          isEmpty ? 'tm-notes-rich-body--empty' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
        }}
        onClick={handleClick}
        onKeyUp={onSelectionChange}
      />
    )
  },
)
