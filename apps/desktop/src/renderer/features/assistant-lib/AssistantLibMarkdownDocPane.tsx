import type { ReactNode } from 'react'
import { MessageMarkdown } from '../chat/MessageMarkdown'
import { DEFAULT_MESSAGE_SETTINGS } from '../chat/message-settings'

const LESSON_PLAN_MARKDOWN_SETTINGS = {
  ...DEFAULT_MESSAGE_SETTINGS,
  fancyCodeBlocks: false,
  wrapCodeBlocks: true,
}

export function AssistantLibMarkdownDocPane({
  hint,
  editLabel,
  doneLabel,
  emptyLabel,
  ariaLabel,
  value,
  editing,
  busy,
  banner,
  headerActions,
  plainLists,
  onEditingChange,
  onChange,
}: {
  hint: string
  editLabel: string
  doneLabel: string
  emptyLabel: string
  ariaLabel: string
  value: string
  editing: boolean
  busy: boolean
  banner?: ReactNode
  headerActions?: ReactNode
  /** Syllabus preview: unordered lists stay as lines, without a disc marker. */
  plainLists?: boolean
  onEditingChange: (editing: boolean) => void
  onChange: (value: string) => void
}) {
  return (
    <>
      <div className="tm-alib-lesson-plan-header">
        <div className="tm-alib-lesson-plan-header-copy">
          <p className="tm-kb-settings-hint">{hint}</p>
          {banner}
        </div>
        <div className="tm-alib-lesson-plan-header-actions">
          {headerActions}
          <button
            type="button"
            className="tm-kb-settings-inline-btn"
            disabled={busy}
            onClick={() => onEditingChange(!editing)}
          >
            {editing ? doneLabel : editLabel}
          </button>
        </div>
      </div>
      <div className="tm-alib-lesson-plan-body">
        {editing ? (
          <textarea
            className="tm-alib-lesson-plan-editor"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={ariaLabel}
          />
        ) : value.trim() ? (
          <div
            className={
              plainLists
                ? 'tm-alib-lesson-plan-preview tm-alib-lesson-plan-preview--plain'
                : 'tm-alib-lesson-plan-preview'
            }
          >
            <MessageMarkdown text={value} settings={LESSON_PLAN_MARKDOWN_SETTINGS} />
          </div>
        ) : (
          <p className="tm-kb-settings-hint">{emptyLabel}</p>
        )}
      </div>
    </>
  )
}
