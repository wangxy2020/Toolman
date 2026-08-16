import type { MouseEvent } from 'react'
import { IconRedo, IconUndo } from '../../components/icons'
import type { NotesEditorToolbarTipProps } from './notes-editor-toolbar-types'

const ICON_SIZE = 16

type Props = {
  disabled: boolean
  canUndo: boolean
  canRedo: boolean
  undoLabel: string
  redoLabel: string
  preserveSelection: (event: MouseEvent) => void
  hideTip: () => void
  tipProps: NotesEditorToolbarTipProps
  onUndo?: () => void
  onRedo?: () => void
}

export function NotesEditorToolbarHistoryGroup({
  disabled,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  preserveSelection,
  hideTip,
  tipProps,
  onUndo,
  onRedo,
}: Props) {
  return (
    <>
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
    </>
  )
}
