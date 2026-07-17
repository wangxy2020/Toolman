import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  editorHtmlToMarkdown,
  getMarkdownSelectionOffset,
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
  insertImage: (filePath: string, alt?: string) => void
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
      insertImage: (filePath: string, alt?: string) => {
        const root = rootRef.current
        if (!root) return
        insertRichImage(root, filePath, alt)
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
      if (focusedRef.current && value === lastRenderedRef.current) return
      syncFromMarkdown(value)
      lastEmittedRef.current = value
    }, [value])

    const handleInput = () => {
      const root = rootRef.current
      if (!root) return
      emitMarkdown(editorHtmlToMarkdown(root))
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
        onKeyDown={onKeyDown}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
        }}
        onClick={onSelectionChange}
        onKeyUp={onSelectionChange}
      />
    )
  },
)
