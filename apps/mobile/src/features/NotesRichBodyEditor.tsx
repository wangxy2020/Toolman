import { createElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, TextInput, View } from 'react-native'
import { colors } from '../theme'
import {
  editorHtmlToMarkdown,
  markdownToEditorHtml,
  richEditorIsEmpty,
} from './noteRichEditor'

type Props = {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  fontSize?: number
  readOnly?: boolean
}

const STYLE_ID = 'toolman-mobile-note-rich-editor'

function ensureNoteEditorStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.tm-mobile-note-body {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 200px;
  margin: 0;
  padding: 0;
  outline: none;
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1.7;
  color: ${colors.text};
  font-family: inherit;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  cursor: text;
}
.tm-mobile-note-body--empty:not(:focus)::before {
  content: attr(data-placeholder);
  color: ${colors.textSecondary};
  pointer-events: none;
}
.tm-mobile-note-body strong,
.tm-mobile-note-body b { font-weight: 700; }
.tm-mobile-note-body em,
.tm-mobile-note-body i { font-style: italic; }
.tm-mobile-note-body u { text-decoration: underline; }
.tm-mobile-note-body s,
.tm-mobile-note-body strike,
.tm-mobile-note-body del { text-decoration: line-through; }
.tm-mobile-note-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: ${colors.inputBg};
}
.tm-mobile-note-body pre {
  margin: 0.6em 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: ${colors.inputBg};
  overflow-x: auto;
}
.tm-mobile-note-body pre code { padding: 0; background: transparent; }
.tm-mobile-note-body h1 { font-size: 1.6em; font-weight: 700; margin: 0.6em 0 0.35em; }
.tm-mobile-note-body h2 { font-size: 1.35em; font-weight: 700; margin: 0.55em 0 0.3em; }
.tm-mobile-note-body h3 { font-size: 1.15em; font-weight: 700; margin: 0.5em 0 0.25em; }
.tm-mobile-note-body blockquote {
  margin: 0.4em 0;
  padding-left: 12px;
  border-left: 3px solid ${colors.border};
  color: ${colors.textSecondary};
}
.tm-mobile-note-body ul,
.tm-mobile-note-body ol {
  margin: 0.35em 0;
  padding-left: 1.4em;
  padding-right: 0;
}
.tm-mobile-note-body a,
.tm-mobile-note-body span[data-wiki] {
  color: ${colors.accent};
  text-decoration: underline;
}
.tm-mobile-note-body li[data-task]::marker { content: ''; }
.tm-mobile-note-body li[data-task] {
  list-style: none;
  margin-left: -1.1em;
}
.tm-mobile-note-body li[data-task]::before {
  content: '☐ ';
  color: ${colors.textSecondary};
}
.tm-mobile-note-body li[data-task="x"]::before { content: '☑ '; }
`
  document.head.appendChild(style)
}

function WebNotesRichBodyEditor({
  value,
  placeholder,
  onChange,
  fontSize = 16,
  readOnly = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const lastEmittedRef = useRef(value)
  const lastRenderedRef = useRef(value)
  const focusedRef = useRef(false)
  const [empty, setEmpty] = useState(() => !value.trim())

  const syncFromMarkdown = (markdown: string) => {
    const root = ref.current
    if (!root) return
    root.innerHTML = markdownToEditorHtml(markdown)
    lastRenderedRef.current = markdown
    setEmpty(richEditorIsEmpty(root))
  }

  useLayoutEffect(() => {
    ensureNoteEditorStyles()
    syncFromMarkdown(value)
    lastEmittedRef.current = value
  }, [])

  useEffect(() => {
    if (value === lastEmittedRef.current) return
    if (focusedRef.current && value === lastRenderedRef.current) return
    syncFromMarkdown(value)
    lastEmittedRef.current = value
  }, [value])

  return createElement('div', {
    ref: (node: HTMLDivElement | null) => {
      ref.current = node
    },
    className: `tm-mobile-note-body${empty ? ' tm-mobile-note-body--empty' : ''}`,
    contentEditable: !readOnly,
    suppressContentEditableWarning: true,
    role: 'textbox',
    'aria-multiline': true,
    'aria-readonly': readOnly || undefined,
    'data-placeholder': placeholder ?? '',
    style: { fontSize },
    onInput: () => {
      if (readOnly) return
      const root = ref.current
      if (!root) return
      const markdown = editorHtmlToMarkdown(root)
      lastEmittedRef.current = markdown
      lastRenderedRef.current = markdown
      setEmpty(!markdown.trim())
      onChange(markdown)
    },
    onFocus: () => {
      focusedRef.current = true
    },
    onBlur: () => {
      focusedRef.current = false
    },
  })
}

function NativeNotesRichBodyEditor({
  value,
  placeholder,
  onChange,
  fontSize = 16,
  readOnly = false,
}: Props) {
  const lastEmittedRef = useRef(value)
  const [text, setText] = useState(value)

  useEffect(() => {
    if (value === lastEmittedRef.current) return
    setText(value)
    lastEmittedRef.current = value
  }, [value])

  return (
    <TextInput
      style={[styles.nativeFallback, { fontSize, lineHeight: Math.round(fontSize * 1.7) }]}
      multiline
      value={text}
      editable={!readOnly}
      onChangeText={(next) => {
        lastEmittedRef.current = next
        setText(next)
        onChange(next)
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
    />
  )
}

/** Always-on rich body editor: formatted text stays editable, Markdown markers stay hidden. */
export function NotesRichBodyEditor(props: Props) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return <WebNotesRichBodyEditor {...props} />
  }
  return (
    <View style={styles.nativeWrap}>
      <NativeNotesRichBodyEditor {...props} />
    </View>
  )
}

const styles = StyleSheet.create({
  nativeWrap: {
    flexGrow: 1,
    minHeight: 200,
  },
  nativeFallback: {
    flexGrow: 1,
    minHeight: 200,
    padding: 0,
    fontSize: 16,
    lineHeight: 27,
    color: colors.text,
    backgroundColor: 'transparent',
    textAlignVertical: 'top',
    ...Platform.select({ web: { outlineWidth: 0 }, default: {} }),
  },
})
