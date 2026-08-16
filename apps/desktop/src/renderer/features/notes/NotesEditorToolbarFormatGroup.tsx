import type { MouseEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  IconCodeBlock,
  IconFormula,
  IconImage,
  IconLink,
  IconListBullet,
  IconListOrdered,
  IconQuote,
  IconTable,
  IconTaskList,
} from '../../components/icons'
import { FONT_SIZE_PRESETS } from './useNotesEditorToolbar'
import type { NotesToolbarFormatState } from './notes-rich-editor'
import type {
  NotesEditorToolbarItem,
  NotesEditorToolbarTipProps,
  NoteToolbarActionKey,
} from './notes-editor-toolbar-types'

const ICON_SIZE = 16

function buildToolbarItems(
  titles: Record<NoteToolbarActionKey, string>,
): NotesEditorToolbarItem[] {
  return [
    { key: 'bold', title: titles.bold, label: <strong>B</strong>, variant: 'text', activeKey: 'bold' },
    { key: 'italic', title: titles.italic, label: <em>I</em>, variant: 'text', activeKey: 'italic' },
    {
      key: 'underline',
      title: titles.underline,
      label: <span className="tm-notes-editor-toolbar-underline">U</span>,
      variant: 'text',
      activeKey: 'underline',
    },
    {
      key: 'strike',
      title: titles.strike,
      label: <span className="tm-notes-editor-toolbar-strike">S</span>,
      variant: 'text',
      activeKey: 'strike',
    },
    {
      key: 'code',
      title: titles.code,
      label: <span className="tm-notes-editor-toolbar-code">&lt;&gt;</span>,
      variant: 'text',
    },
    {
      key: 'clearFormat',
      title: titles.clearFormat,
      label: <span className="tm-notes-editor-toolbar-clear">Tx</span>,
      variant: 'text',
      dividerAfter: true,
    },
    {
      key: 'fontSize',
      title: titles.fontSize,
      label: <span className="tm-notes-editor-toolbar-fontsize">A▾</span>,
      variant: 'text',
    },
    {
      key: 'body',
      title: titles.body,
      label: <span className="tm-notes-editor-toolbar-body">T</span>,
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
}

type FontSizeLabels = Record<(typeof FONT_SIZE_PRESETS)[number]['key'], string>

type Props = {
  disabled: boolean
  formatState?: NotesToolbarFormatState
  titles: Record<NoteToolbarActionKey, string>
  fontMenuOpen: boolean
  fontMenuPos: { top: number; left: number } | null
  fontMenuButtonRef: RefObject<HTMLButtonElement | null>
  fontMenuPanelRef: RefObject<HTMLDivElement | null>
  fontSizeLabels: FontSizeLabels
  preserveSelection: (event: MouseEvent) => void
  tipProps: NotesEditorToolbarTipProps
  handleClick: (item: { key: NoteToolbarActionKey }) => void
  onRunAction: (key: NoteToolbarActionKey, options?: { fontSizePx?: number }) => void
  setFontMenuOpen: (open: boolean) => void
}

export function NotesEditorToolbarFormatGroup({
  disabled,
  formatState,
  titles,
  fontMenuOpen,
  fontMenuPos,
  fontMenuButtonRef,
  fontMenuPanelRef,
  fontSizeLabels,
  preserveSelection,
  tipProps,
  handleClick,
  onRunAction,
  setFontMenuOpen,
}: Props) {
  const toolbarItems = buildToolbarItems(titles)

  return (
    <>
      {toolbarItems.map((item) => {
        const isActive = item.activeKey ? Boolean(formatState?.[item.activeKey]) : false
        if (item.key === 'fontSize') {
          return (
            <span key={item.key} className="tm-notes-editor-toolbar-item">
              <button
                ref={fontMenuButtonRef}
                type="button"
                className={[
                  'tm-notes-editor-toolbar-btn',
                  fontMenuOpen ? 'tm-notes-editor-toolbar-btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={item.title}
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={fontMenuOpen}
                onMouseDown={preserveSelection}
                onClick={() => handleClick(item)}
                {...tipProps(item.title)}
              >
                {item.label}
              </button>
              {fontMenuOpen && fontMenuPos
                ? createPortal(
                    <div
                      ref={fontMenuPanelRef}
                      className="tm-notes-editor-toolbar-font-menu"
                      role="menu"
                      style={{ top: fontMenuPos.top, left: fontMenuPos.left }}
                    >
                      {FONT_SIZE_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          role="menuitem"
                          className="tm-notes-editor-toolbar-font-option"
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
              {item.dividerAfter ? <span className="tm-notes-editor-toolbar-divider" /> : null}
            </span>
          )
        }
        return (
          <span key={item.key} className="tm-notes-editor-toolbar-item">
            <button
              type="button"
              className={[
                'tm-notes-editor-toolbar-btn',
                item.variant === 'icon' ? 'tm-notes-editor-toolbar-btn--icon' : '',
                item.variant === 'heading' ? 'tm-notes-editor-toolbar-btn--heading' : '',
                item.variant === 'body' ? 'tm-notes-editor-toolbar-btn--body' : '',
                isActive ? 'tm-notes-editor-toolbar-btn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={item.title}
              aria-pressed={item.activeKey ? isActive : undefined}
              disabled={disabled}
              onMouseDown={preserveSelection}
              onClick={() => handleClick(item)}
              {...tipProps(item.title)}
            >
              {item.label}
            </button>
            {item.dividerAfter ? <span className="tm-notes-editor-toolbar-divider" /> : null}
          </span>
        )
      })}
    </>
  )
}
