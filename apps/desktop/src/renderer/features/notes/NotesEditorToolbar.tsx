import { createPortal } from 'react-dom'
import { IconOutline } from '../../components/icons'
import { NotesEditorToolbarFormatGroup } from './NotesEditorToolbarFormatGroup'
import { NotesEditorToolbarHistoryGroup } from './NotesEditorToolbarHistoryGroup'
import { useNotesEditorToolbar } from './useNotesEditorToolbar'
import type { NotesEditorToolbarProps } from './notes-editor-toolbar-types'

export type {
  NoteToolbarActionKey,
  NotesEditorToolbarProps,
} from './notes-editor-toolbar-types'

const ICON_SIZE = 16

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
            <NotesEditorToolbarFormatGroup
              disabled={disabled}
              formatState={formatState}
              titles={titles}
              fontMenuOpen={fontMenuOpen}
              fontMenuPos={fontMenuPos}
              fontMenuButtonRef={fontMenuButtonRef}
              fontMenuPanelRef={fontMenuPanelRef}
              fontSizeLabels={fontSizeLabels}
              preserveSelection={preserveSelection}
              tipProps={tipProps}
              handleClick={handleClick}
              onRunAction={onRunAction}
              setFontMenuOpen={setFontMenuOpen}
            />
            <NotesEditorToolbarHistoryGroup
              disabled={disabled}
              canUndo={canUndo}
              canRedo={canRedo}
              undoLabel={undoLabel}
              redoLabel={redoLabel}
              preserveSelection={preserveSelection}
              hideTip={hideTip}
              tipProps={tipProps}
              onUndo={onUndo}
              onRedo={onRedo}
            />
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
