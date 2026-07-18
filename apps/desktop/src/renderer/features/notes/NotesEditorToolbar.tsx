import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
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

type TooltipState = { text: string; top: number; left: number }

type ScrollMetrics = {
  overflowing: boolean
  /** Thumb width as fraction of track (0–1). */
  thumbSize: number
  /** Thumb offset as fraction of track (0–1). */
  thumbOffset: number
}

const EMPTY_SCROLL: ScrollMetrics = { overflowing: false, thumbSize: 1, thumbOffset: 0 }

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
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>(EMPTY_SCROLL)
  const fontMenuButtonRef = useRef<HTMLButtonElement>(null)
  const fontMenuPanelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const syncScrollMetrics = () => {
    const el = scrollRef.current
    if (!el) return
    const { scrollWidth, clientWidth, scrollLeft } = el
    const overflowing = scrollWidth > clientWidth + 1
    if (!overflowing) {
      setScrollMetrics(EMPTY_SCROLL)
      return
    }
    const thumbSize = Math.min(1, clientWidth / scrollWidth)
    const maxScroll = scrollWidth - clientWidth
    const thumbOffset = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * (1 - thumbSize)
    setScrollMetrics({ overflowing: true, thumbSize, thumbOffset })
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    syncScrollMetrics()
    const ro = new ResizeObserver(() => syncScrollMetrics())
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    window.addEventListener('resize', syncScrollMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncScrollMetrics)
    }
  }, [])

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

  const preserveSelection = (event: ReactMouseEvent) => {
    event.preventDefault()
  }

  const showTipFromEl = (el: HTMLElement, text: string) => {
    const rect = el.getBoundingClientRect()
    setTooltip({ text, top: rect.bottom + 6, left: rect.left + rect.width / 2 })
  }

  const hideTip = () => setTooltip(null)

  const tipProps = (text: string) => ({
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => showTipFromEl(event.currentTarget, text),
    onMouseLeave: hideTip,
    onFocus: (event: ReactFocusEvent<HTMLElement>) => showTipFromEl(event.currentTarget, text),
    onBlur: hideTip,
  })

  const handleClick = (item: ToolbarItem) => {
    if (disabled) return
    hideTip()
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

  const scrollToThumbOffset = (nextOffset: number) => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const travel = 1 - thumbSize
    const clamped = Math.max(0, Math.min(travel, nextOffset))
    el.scrollLeft = travel <= 0 ? 0 : (clamped / travel) * maxScroll
  }

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    const el = scrollRef.current
    if (!track || !el) return
    event.preventDefault()
    const trackRect = track.getBoundingClientRect()
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const pointerRatio = (event.clientX - trackRect.left) / trackRect.width
    // Center thumb on click.
    scrollToThumbOffset(pointerRatio - thumbSize / 2)

    const onMove = (moveEvent: PointerEvent) => {
      const ratio = (moveEvent.clientX - trackRect.left) / trackRect.width
      scrollToThumbOffset(ratio - thumbSize / 2)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const undoLabel = t('notesPage.editor.toolbar.undo')
  const redoLabel = t('notesPage.editor.toolbar.redo')
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
