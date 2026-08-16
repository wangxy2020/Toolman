import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { getNotesToolbarTitles } from '../../i18n/notes-editor-labels'
import { useI18n } from '../../i18n/useI18n'
import type { NoteToolbarActionKey, NotesEditorToolbarProps } from './notes-editor-toolbar-types'

/** Relative sizes shown as 较小 / 正常 / 较大 / 更大 */
export const FONT_SIZE_PRESETS = [
  { key: 'smaller', px: 13 },
  { key: 'normal', px: 16 },
  { key: 'larger', px: 20 },
  { key: 'largest', px: 24 },
] as const

type TooltipState = { text: string; top: number; left: number }

type ScrollMetrics = {
  overflowing: boolean
  /** Thumb width as fraction of track (0–1). */
  thumbSize: number
  /** Thumb offset as fraction of track (0–1). */
  thumbOffset: number
}

const EMPTY_SCROLL: ScrollMetrics = { overflowing: false, thumbSize: 1, thumbOffset: 0 }

type UseNotesEditorToolbarProps = Pick<
  NotesEditorToolbarProps,
  'disabled' | 'onRunAction' | 'onRunImage' | 'onRunLink' | 'onUndo' | 'onRedo' | 'canUndo' | 'canRedo'
>

/**
 * State/handlers for `NotesEditorToolbar` — tooltip + font-size menu positioning, the custom
 * H-scrollbar thumb, and click dispatch. Kept separate so the component only deals with markup.
 */
export function useNotesEditorToolbar({
  disabled = false,
  onRunAction,
  onRunImage,
  onRunLink,
}: UseNotesEditorToolbarProps) {
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

  const handleClick = (item: { key: NoteToolbarActionKey }) => {
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

  return {
    t,
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
  }
}