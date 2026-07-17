import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  IconCodeBlock,
  IconFormula,
  IconImage,
  IconLink,
  IconListBullet,
  IconListOrdered,
  IconOutline,
  IconQuote,
  IconRedo,
  IconTable,
  IconTaskList,
  IconUndo,
} from '../../components/icons'
import { getNotesToolbarTitles } from '../../i18n/notes-editor-labels'
import { useI18n } from '../../i18n/useI18n'
import type { NotesToolbarFormatState } from './notes-rich-editor'

const ICON_SIZE = 16

/** Relative sizes shown as 较小 / 正常 / 较大 / 更大 */
const FONT_SIZE_PRESETS = [
  { key: 'smaller', px: 13 },
  { key: 'normal', px: 16 },
  { key: 'larger', px: 20 },
  { key: 'largest', px: 24 },
] as const

export type NoteToolbarActionKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'clearFormat'
  | 'fontSize'
  | 'body'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'image'
  | 'codeblock'
  | 'quote'
  | 'task'
  | 'math'
  | 'table'
  | 'link'

type ToolbarItem = {
  key: NoteToolbarActionKey
  title: string
  label: ReactNode
  variant?: 'text' | 'icon' | 'heading' | 'body'
  dividerAfter?: boolean
  async?: boolean
  activeKey?: keyof NotesToolbarFormatState
}

interface Props {
  disabled?: boolean
  formatState?: NotesToolbarFormatState
  onRunAction: (key: NoteToolbarActionKey, options?: { fontSizePx?: number }) => void
  onRunImage: () => void | Promise<void>
  onRunLink: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  showOutline?: boolean
  onToggleOutline?: () => void
}

export function NotesEditorToolbar({
  disabled = false,
  formatState,
  onRunAction,
  onRunImage,
  onRunLink,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  showOutline = false,
  onToggleOutline,
}: Props) {
  const { t } = useI18n()
  const titles = getNotesToolbarTitles(t)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [fontMenuPos, setFontMenuPos] = useState<{ top: number; left: number } | null>(null)
  const fontMenuButtonRef = useRef<HTMLButtonElement>(null)
  const fontMenuPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!fontMenuOpen) {
      setFontMenuPos(null)
      return
    }
    const updatePos = () => {
      const el = fontMenuButtonRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setFontMenuPos({ top: rect.bottom + 4, left: rect.left })
    }
    updatePos()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (fontMenuButtonRef.current?.contains(target)) return
      if (fontMenuPanelRef.current?.contains(target)) return
      setFontMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [fontMenuOpen])

  const fontSizeLabels: Record<(typeof FONT_SIZE_PRESETS)[number]['key'], string> = {
    smaller: t('notesPage.editor.toolbar.fontSizeSmaller'),
    normal: t('notesPage.editor.toolbar.fontSizeNormal'),
    larger: t('notesPage.editor.toolbar.fontSizeLarger'),
    largest: t('notesPage.editor.toolbar.fontSizeLargest'),
  }

  const toolbarItems: ToolbarItem[] = [
    { key: 'bold', title: titles.bold, label: <strong>B</strong>, variant: 'text', activeKey: 'bold' },
    { key: 'italic', title: titles.italic, label: <em>I</em>, variant: 'text', activeKey: 'italic' },
    {
      key: 'underline',
      title: titles.underline,
      label: <span className="tm-notes-toolbar-underline">U</span>,
      variant: 'text',
      activeKey: 'underline',
    },
    {
      key: 'strike',
      title: titles.strike,
      label: <span className="tm-notes-toolbar-strike">S</span>,
      variant: 'text',
      activeKey: 'strike',
    },
    {
      key: 'code',
      title: titles.code,
      label: <span className="tm-notes-toolbar-code">&lt;&gt;</span>,
      variant: 'text',
    },
    {
      key: 'clearFormat',
      title: titles.clearFormat,
      label: <span className="tm-notes-toolbar-clear">Tx</span>,
      variant: 'text',
      dividerAfter: true,
    },
    {
      key: 'fontSize',
      title: titles.fontSize,
      label: <span className="tm-notes-toolbar-fontsize">A▾</span>,
      variant: 'text',
    },
    {
      key: 'body',
      title: titles.body,
      label: <span className="tm-notes-toolbar-body">T</span>,
      variant: 'body',
      activeKey: 'body',
    },
    { key: 'h1', title: titles.h1, label: 'H1', variant: 'heading', activeKey: 'h1' },
    { key: 'h2', title: titles.h2, label: 'H2', variant: 'heading', activeKey: 'h2' },
    {
      key: 'h3',
      title: titles.h3,
      label: 'H3',
      variant: 'heading',
      activeKey: 'h3',
      dividerAfter: true,
    },
    {
      key: 'bullet',
      title: titles.bullet,
      label: <IconListBullet size={ICON_SIZE} />,
      variant: 'icon',
    },
    {
      key: 'ordered',
      title: titles.ordered,
      label: <IconListOrdered size={ICON_SIZE} />,
      variant: 'icon',
      dividerAfter: true,
    },
    {
      key: 'image',
      title: titles.image,
      label: <IconImage size={ICON_SIZE} />,
      variant: 'icon',
      async: true,
    },
    {
      key: 'codeblock',
      title: titles.codeblock,
      label: <IconCodeBlock size={ICON_SIZE} />,
      variant: 'icon',
    },
    { key: 'quote', title: titles.quote, label: <IconQuote size={ICON_SIZE} />, variant: 'icon' },
    { key: 'task', title: titles.task, label: <IconTaskList size={ICON_SIZE} />, variant: 'icon' },
    { key: 'math', title: titles.math, label: <IconFormula size={ICON_SIZE} />, variant: 'icon' },
    {
      key: 'table',
      title: titles.table,
      label: <IconTable size={ICON_SIZE} />,
      variant: 'icon',
      dividerAfter: true,
    },
    {
      key: 'link',
      title: titles.link,
      label: <IconLink size={ICON_SIZE} />,
      variant: 'icon',
      async: true,
    },
  ]

  const preserveSelection = (event: ReactMouseEvent) => {
    // Keep contentEditable selection when clicking toolbar controls.
    event.preventDefault()
  }

  const handleClick = (item: ToolbarItem) => {
    if (disabled) return
    if (item.key === 'fontSize') {
      setFontMenuOpen((open) => !open)
      return
    }
    if (item.key === 'image') {
      void onRunImage()
      return
    }
    if (item.key === 'link') {
      onRunLink()
      return
    }
    onRunAction(item.key)
  }

  return (
    <div className="tm-notes-toolbar">
      <div className="tm-notes-toolbar-group">
        {toolbarItems.map((item) => {
          const isActive = item.activeKey ? Boolean(formatState?.[item.activeKey]) : false
          if (item.key === 'fontSize') {
            return (
              <span key={item.key} className="tm-notes-toolbar-item">
                <button
                  ref={fontMenuButtonRef}
                  type="button"
                  className={[
                    'tm-notes-toolbar-btn',
                    fontMenuOpen ? 'tm-notes-toolbar-btn--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-tooltip={item.title}
                  disabled={disabled}
                  aria-haspopup="menu"
                  aria-expanded={fontMenuOpen}
                  onMouseDown={preserveSelection}
                  onClick={() => handleClick(item)}
                >
                  {item.label}
                </button>
                {fontMenuOpen && fontMenuPos
                  ? createPortal(
                      <div
                        ref={fontMenuPanelRef}
                        className="tm-notes-toolbar-font-menu"
                        role="menu"
                        style={{ top: fontMenuPos.top, left: fontMenuPos.left }}>
                        {FONT_SIZE_PRESETS.map((preset) => (
                          <button
                            key={preset.key}
                            type="button"
                            role="menuitem"
                            className="tm-notes-toolbar-font-option"
                            disabled={disabled}
                            onMouseDown={preserveSelection}
                            onClick={() => {
                              onRunAction('fontSize', { fontSizePx: preset.px })
                              setFontMenuOpen(false)
                            }}
                          >
                            {fontSizeLabels[preset.key]}
                          </button>
                        ))}
                      </div>,
                      document.body,
                    )
                  : null}
                {item.dividerAfter ? <span className="tm-notes-toolbar-divider" /> : null}
              </span>
            )
          }
          return (
            <span key={item.key} className="tm-notes-toolbar-item">
              <button
                type="button"
                className={[
                  'tm-notes-toolbar-btn',
                  item.variant === 'icon' ? 'tm-notes-toolbar-btn--icon' : '',
                  item.variant === 'heading' ? 'tm-notes-toolbar-btn--heading' : '',
                  item.variant === 'body' ? 'tm-notes-toolbar-btn--body' : '',
                  isActive ? 'tm-notes-toolbar-btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-tooltip={item.title}
                aria-pressed={item.activeKey ? isActive : undefined}
                disabled={disabled}
                onMouseDown={preserveSelection}
                onClick={() => handleClick(item)}
              >
                {item.label}
              </button>
              {item.dividerAfter ? <span className="tm-notes-toolbar-divider" /> : null}
            </span>
          )
        })}
        <span className="tm-notes-toolbar-divider" />
        <button
          type="button"
          className="tm-notes-toolbar-btn tm-notes-toolbar-btn--icon"
          data-tooltip={t('notesPage.editor.toolbar.undo')}
          disabled={disabled || !canUndo}
          onMouseDown={preserveSelection}
          onClick={onUndo}
        >
          <IconUndo size={ICON_SIZE} />
        </button>
        <button
          type="button"
          className="tm-notes-toolbar-btn tm-notes-toolbar-btn--icon"
          data-tooltip={t('notesPage.editor.toolbar.redo')}
          disabled={disabled || !canRedo}
          onMouseDown={preserveSelection}
          onClick={onRedo}
        >
          <IconRedo size={ICON_SIZE} />
        </button>
      </div>
      <div className="tm-notes-toolbar-end">
        <button
          type="button"
          className={[
            'tm-notes-toolbar-btn tm-notes-toolbar-btn--icon',
            showOutline ? 'tm-notes-toolbar-btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-tooltip={
            showOutline ? t('notesPage.editor.outlineHide') : t('notesPage.editor.outlineShow')
          }
          aria-pressed={showOutline}
          onMouseDown={preserveSelection}
          onClick={onToggleOutline}
        >
          <IconOutline size={ICON_SIZE} />
        </button>
      </div>
    </div>
  )
}
