import { useCallback, useRef, useState } from 'react'

import { IconEmoji, IconMic, IconSend } from '../../components/icons'
import { EmojiPickerPopup } from '../chat/EmojiPickerPopup'
import {
  getSystemVoiceInputHint,
  getSystemVoiceInputTitle,
} from '../chat/system-voice-input'

interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  submitting?: boolean
  disabled?: boolean
  placeholder?: string
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  currentText: string,
  insertion: string,
): { nextText: string; cursor: number } {
  const start = textarea.selectionStart ?? currentText.length
  const end = textarea.selectionEnd ?? currentText.length
  const nextText = currentText.slice(0, start) + insertion + currentText.slice(end)
  return { nextText, cursor: start + insertion.length }
}

export function CommunityCommentInput({
  value,
  onChange,
  onSubmit,
  submitting = false,
  disabled = false,
  placeholder = '写下你的评论…',
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiAnchorRef = useRef<HTMLSpanElement>(null)
  const voiceHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false)
  const [voiceHint, setVoiceHint] = useState<string | null>(null)

  const focusTextarea = useCallback((cursor?: number) => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    if (cursor != null) {
      textarea.setSelectionRange(cursor, cursor)
    }
  }, [])

  const applyTextInsertion = useCallback(
    (insertion: string) => {
      const textarea = textareaRef.current
      if (!textarea) {
        onChange(value ? `${value}${insertion}` : insertion)
        return
      }

      const { nextText, cursor } = insertAtCursor(textarea, value, insertion)
      onChange(nextText)
      requestAnimationFrame(() => focusTextarea(cursor))
    },
    [focusTextarea, onChange, value],
  )

  const handleSystemVoiceInput = useCallback(() => {
    focusTextarea(value.length)
    const hint = getSystemVoiceInputHint()
    setVoiceHint(hint)
    if (voiceHintTimerRef.current) clearTimeout(voiceHintTimerRef.current)
    voiceHintTimerRef.current = setTimeout(() => setVoiceHint(null), 8000)
  }, [focusTextarea, value.length])

  const handleSubmit = useCallback(() => {
    if (disabled || submitting || !value.trim()) return
    void onSubmit()
  }, [disabled, onSubmit, submitting, value])

  const canSend = value.trim().length > 0

  return (
    <div className="tm-community-comment-input-area">
      <div
        className={[
          'tm-community-comment-input-box',
          canSend ? 'tm-community-comment-input-box--ready' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="tm-community-comment-input-toolbar-top">
          <span className="tm-community-comment-input-tool-anchor" ref={emojiAnchorRef}>
            <button
              type="button"
              className={[
                'tm-community-comment-input-tool',
                emojiMenuOpen ? 'tm-community-comment-input-tool--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={disabled || submitting}
              title="表情"
              aria-label="插入表情"
              onClick={() => setEmojiMenuOpen((open) => !open)}
            >
              <IconEmoji size={16} />
            </button>
            <EmojiPickerPopup
              open={emojiMenuOpen}
              anchorRef={emojiAnchorRef}
              onClose={() => setEmojiMenuOpen(false)}
              onSelect={(emoji) => {
                applyTextInsertion(emoji)
                setEmojiMenuOpen(false)
              }}
            />
          </span>
          {voiceHint ? (
            <span className="tm-community-comment-input-voice-hint" role="status" title={voiceHint}>
              {voiceHint}
            </span>
          ) : null}
        </div>

        <textarea
          ref={textareaRef}
          className="tm-community-comment-input-field"
          value={value}
          placeholder={placeholder}
          disabled={disabled || submitting}
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSubmit()
            }
          }}
        />

        <div className="tm-community-comment-input-footer">
          <button
            type="button"
            className="tm-community-comment-input-tool"
            disabled={disabled || submitting}
            title={getSystemVoiceInputTitle()}
            aria-label="语音输入"
            onClick={handleSystemVoiceInput}
          >
            <IconMic size={16} />
          </button>
          <button
            type="button"
            className={[
              'tm-community-comment-input-send',
              canSend ? 'tm-community-comment-input-send--ready' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title="发送"
            aria-label="发送评论"
            disabled={disabled || submitting || !canSend}
            onClick={() => void handleSubmit()}
          >
            <IconSend size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
