import type { ReactNode } from 'react'
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
import { FONT_SIZE_PRESETS, useNotesEditorToolbar } from './useNotesEditorToolbar'
import type { NotesToolbarFormatState } from './notes-rich-editor'

const ICON_SIZE = 16

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

export interface NotesEditorToolbarProps {
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
}: NotesEditorToolbarProps) {
  const {
    titles,
    fontMenuOpen,
    setFontMenuOpen,
    fontMenuPos,
    tooltip,
    scrollMetrics,
    fontMenuButtonRef,
    fontMenuPanelRef,
    scrollRef,
    trackRef,
    syncScrollMetrics,
    fontSizeLabels,
    preserveSelection,
    hideTip,
    tipProps,
    handleClick,
    onTrackPointerDown,
    undoLabel,
    redoLabel,
    t,
  } = useNotesEditorToolbar({ disabled, onRunAction, onRunImage, onRunLink, onUndo, onRedo, canUndo, canRedo })

  const toolbarItems: ToolbarItem[] = [
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

  const outlineLabel = showOutline
    ? t('notesPage.editor.outlineHide')
    : t('notesPage.editor.outlineShow')

  return (
    <div
      className={[
        'tm-notes-editor-toolbar',
        scrollMetrics.overflowing ? 'tm-notes-editor-toolbar--overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="tm-notes-editor-toolbar-main">
        <div
          ref={scrollRef}
          className="tm-notes-editor-toolbar-scroll"
          onScroll={() => {
            hideTip()
            syncScrollMetrics()
          }}
        >
          <div className="tm-notes-editor-toolbar-group">
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
                    {item.dividerAfter ? (
                      <span className="tm-notes-editor-toolbar-divider" />
                    ) : null}
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
            <span className="tm-notes-editor-toolbar-divider" />
            <button
              type="button"
              className="tm-notes-editor-toolbar-btn tm-notes-editor-toolbar-btn--icon"
              aria-label={undoLabel}
              aria-disabled={disabled || !canUndo}
              onMouseDown={(event) => {
                preserveSelection(event)
                if (disabled || !canUndo) event.preventDefault()
              }}
              onClick={() => {
                if (disabled || !canUndo) return
                hideTip()
                onUndo?.()
              }}
              {...tipProps(undoLabel)}
            >
              <IconUndo size={ICON_SIZE} />
            </button>
            <button
              type="button"
              className="tm-notes-editor-toolbar-btn tm-notes-editor-toolbar-btn--icon"
              aria-label={redoLabel}
              aria-disabled={disabled || !canRedo}
              onMouseDown={(event) => {
                preserveSelection(event)
                if (disabled || !canRedo) event.preventDefault()
              }}
              onClick={() => {
                if (disabled || !canRedo) return
                hideTip()
                onRedo?.()
              }}
              {...tipProps(redoLabel)}
            >
              <IconRedo size={ICON_SIZE} />
            </button>
          </div>
        </div>
        {scrollMetrics.overflowing ? (
          <div
            ref={trackRef}
            className="tm-notes-editor-toolbar-hscroll"
            onPointerDown={onTrackPointerDown}
          >
            <div
              className="tm-notes-editor-toolbar-hscroll-thumb"
              style={{
                width: `${scrollMetrics.thumbSize * 100}%`,
                left: `${scrollMetrics.thumbOffset * 100}%`,
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="tm-notes-editor-toolbar-end">
        <button
          type="button"
          className={[
            'tm-notes-editor-toolbar-btn tm-notes-editor-toolbar-btn--icon',
            showOutline ? 'tm-notes-editor-toolbar-btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={outlineLabel}
          aria-pressed={showOutline}
          onMouseDown={preserveSelection}
          onClick={onToggleOutline}
          {...tipProps(outlineLabel)}
        >
          <IconOutline size={ICON_SIZE} />
        </button>
      </div>
      {tooltip
        ? createPortal(
            <div
              className="tm-notes-editor-toolbar-tooltip"
              role="tooltip"
              style={{ top: tooltip.top, left: tooltip.left }}
            >
              {tooltip.text}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
